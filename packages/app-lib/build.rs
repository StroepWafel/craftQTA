use std::collections::HashMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Command, exit};
use std::{env, fs};

fn main() {
	// sqlx::migrate! output changes when migrations/*.sql changes; without this, Cargo may skip
	// rebuilding theseus and the embedded Migrator can disagree with app.db (_sqlx_migrations).
	println!("cargo::rerun-if-changed=migrations");

	println!("cargo::rerun-if-changed=.env");
	println!("cargo::rerun-if-changed=.env.prod");
	println!("cargo::rerun-if-changed=java/gradle");
	println!("cargo::rerun-if-changed=java/src");
	println!("cargo::rerun-if-changed=java/build.gradle.kts");
	println!("cargo::rerun-if-changed=java/settings.gradle.kts");
	println!("cargo::rerun-if-changed=java/gradle.properties");

	set_env();
	build_java_jars();
}

fn merge_dotenv_from_path(path: &str, vars: &mut HashMap<String, String>) {
	if !Path::new(path).exists() {
		return;
	}

	let iter = dotenvy::from_path_iter(path).unwrap_or_else(|e| {
		panic!("theseus build: failed to read {path}: {e}");
	});

	for item in iter {
		let (var_name, var_value) =
			item.unwrap_or_else(|e| panic!("theseus build: failed to parse {path}: {e}"));
		vars.insert(var_name, var_value);
	}
}

fn set_env() {
	let mut vars = HashMap::new();

	merge_dotenv_from_path(".env.prod", &mut vars);
	merge_dotenv_from_path(".env", &mut vars);

	if !vars.contains_key("MODRINTH_API_URL") {
		panic!(
			"theseus build: MODRINTH_API_URL is not set.\n\
			 Create packages/app-lib/.env (gitignored) — copy from .env.prod for production APIs, \
			 or from .env.local if you run Labrinth locally."
		);
	}

	for (var_name, var_value) in vars {
		if var_name == "DATABASE_URL" {
			// The sqlx database URL is a build-time detail that should not be exposed to the crate
			continue;
		}

		println!("cargo::rustc-env={var_name}={var_value}");
	}
}

fn build_java_jars() {
	let out_dir =
		dunce::canonicalize(PathBuf::from(env::var_os("OUT_DIR").unwrap())).unwrap();

	println!(
		"cargo::rustc-env=JAVA_JARS_DIR={}",
		out_dir.join("java/libs").display()
	);

	let gradle_path = fs::canonicalize(
		#[cfg(target_os = "windows")]
		"java\\gradlew.bat",
		#[cfg(not(target_os = "windows"))]
		"java/gradlew",
	)
	.unwrap();

	let mut build_dir_str = OsString::from("-Dorg.gradle.project.buildDir=");
	build_dir_str.push(out_dir.join("java"));
	let exit_status = Command::new(gradle_path)
		.arg(build_dir_str)
		.arg("build")
		.arg("--no-daemon")
		.arg("--console=rich")
		.current_dir(dunce::canonicalize("java").unwrap())
		.status()
		.expect("Failed to wait on Gradle build");

	if !exit_status.success() {
		println!("cargo::error=Gradle build failed with {exit_status}");
		exit(exit_status.code().unwrap_or(1));
	}
}
