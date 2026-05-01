//! Share single-player world folders between instances without copying files.
//!
//! - **Unix:** symbolic links under `saves/`.
//! - **Windows:** directory **junctions** (no symlink privilege; avoids os error 1314 without Developer Mode).

use crate::profile::{self, get_full_path};
use crate::process;
use crate::state::profile_shared_world_links;
use crate::{ErrorKind, Result, State};
use chrono::Utc;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Debug)]
pub struct SharedWorldLink {
	pub local_world_folder: String,
	pub target_profile_path: String,
	pub target_world_folder: String,
	pub created: i64,
}

fn validate_world_folder_segment(name: &str) -> Result<()> {
	if name.is_empty()
		|| name.contains('/')
		|| name.contains('\\')
		|| name.contains("..")
	{
		return Err(ErrorKind::InputError(
			"World folder name must be a single saves folder name (no path separators)."
				.into(),
		)
		.as_error());
	}
	Ok(())
}

async fn ensure_profile_idle(profile_path: &str) -> Result<()> {
	if !process::get_by_profile_path(profile_path).await?.is_empty() {
		return Err(ErrorKind::InputError(
			"Close Minecraft for this instance before changing shared world links.".into(),
		)
		.as_error());
	}
	Ok(())
}

fn saves_dir(profile_root: &Path) -> PathBuf {
	profile_root.join("saves")
}

async fn remove_existing_symlink(link_path: &Path) -> Result<()> {
	let meta = tokio::fs::symlink_metadata(link_path).await?;
	if !meta.file_type().is_symlink() {
		return Err(ErrorKind::InputError(
			"A folder or file already exists with this name; remove it or pick another name."
				.into(),
		)
		.as_error());
	}

	#[cfg(unix)]
	tokio::fs::remove_file(link_path).await?;

	#[cfg(windows)]
	{
		if meta.is_dir() {
			tokio::fs::remove_dir(link_path).await?;
		} else {
			tokio::fs::remove_file(link_path).await?;
		}
	}

	Ok(())
}

async fn create_world_platform_link(target_dir: PathBuf, link_path: PathBuf) -> Result<()> {
	let target_abs = tokio::fs::canonicalize(&target_dir).await?;

	#[cfg(unix)]
	{
		tokio::fs::symlink(&target_abs, &link_path).await?;
	}

	#[cfg(windows)]
	{
		let junction_point = link_path.clone();
		let target = target_abs.clone();
		tokio::task::spawn_blocking(move || {
			junction::create(target, junction_point).map_err(|e| {
				std::io::Error::new(std::io::ErrorKind::Other, format!("junction: {e}"))
			})
		})
		.await??;
	}

	Ok(())
}

/// Lists shared-world symlink metadata for an instance (database rows only).
pub async fn list_for_profile(profile_path: &str) -> Result<Vec<SharedWorldLink>> {
	let state = State::get().await?;
	let rows =
		profile_shared_world_links::list_for_profile(&state.pool, profile_path).await?;
	Ok(rows
		.into_iter()
		.map(|r| SharedWorldLink {
			local_world_folder: r.local_world_folder,
			target_profile_path: r.target_profile_path,
			target_world_folder: r.target_world_folder,
			created: r.created,
		})
		.collect())
}

/// Creates `profile_path/saves/local_world_folder` → `target_profile_path/saves/target_world_folder`.
pub async fn create_link(
	profile_path: &str,
	local_world_folder: &str,
	target_profile_path: &str,
	target_world_folder: &str,
) -> Result<()> {
	if profile_path == target_profile_path && local_world_folder == target_world_folder {
		return Err(ErrorKind::InputError("Cannot link a world to itself.".into()).as_error());
	}

	validate_world_folder_segment(local_world_folder)?;
	validate_world_folder_segment(target_world_folder)?;

	let _ = profile::get(profile_path)
		.await?
		.ok_or_else(|| ErrorKind::UnmanagedProfileError(profile_path.to_string()).as_error())?;
	let _ = profile::get(target_profile_path)
		.await?
		.ok_or_else(|| {
			ErrorKind::UnmanagedProfileError(target_profile_path.to_string()).as_error()
		})?;

	ensure_profile_idle(profile_path).await?;
	ensure_profile_idle(target_profile_path).await?;

	let local_root = get_full_path(profile_path).await?;
	let target_root = get_full_path(target_profile_path).await?;

	let target_world_dir = saves_dir(&target_root).join(target_world_folder);
	if !tokio::fs::try_exists(target_world_dir.join("level.dat")).await? {
		return Err(ErrorKind::InputError(
			"Target folder must be an existing single-player world (missing level.dat)."
				.into(),
		)
		.as_error());
	}

	tokio::fs::create_dir_all(saves_dir(&local_root)).await?;

	let link_path = saves_dir(&local_root).join(local_world_folder);

	if tokio::fs::try_exists(&link_path).await? {
		remove_existing_symlink(&link_path).await?;
	}

	create_world_platform_link(target_world_dir, link_path.clone()).await?;

	let created = Utc::now().timestamp();
	let state = State::get().await?;
	if let Err(e) = profile_shared_world_links::insert(
		&state.pool,
		profile_path,
		local_world_folder,
		target_profile_path,
		target_world_folder,
		created,
	)
	.await
	{
		let _ = remove_existing_symlink(&link_path).await;
		return Err(e);
	}

	Ok(())
}

/// Removes metadata and deletes the junction / symlink at `profile_path/saves/local_world_folder`.
pub async fn remove_link(profile_path: &str, local_world_folder: &str) -> Result<()> {
	validate_world_folder_segment(local_world_folder)?;
	ensure_profile_idle(profile_path).await?;

	let state = State::get().await?;
	let deleted = profile_shared_world_links::delete(
		&state.pool,
		profile_path,
		local_world_folder,
	)
	.await?;
	if deleted == 0 {
		return Err(ErrorKind::InputError("No shared world link exists for that folder.".into())
			.as_error());
	}

	let local_root = get_full_path(profile_path).await?;
	let link_path = saves_dir(&local_root).join(local_world_folder);

	if tokio::fs::try_exists(&link_path).await? {
		remove_existing_symlink(&link_path).await?;
	}

	Ok(())
}
