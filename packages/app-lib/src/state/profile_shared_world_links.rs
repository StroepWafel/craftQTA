use sqlx::{Row, SqlitePool};

#[derive(Debug, Clone)]
pub(crate) struct ProfileSharedWorldLinkRow {
	pub(crate) profile_path: String,
	pub(crate) local_world_folder: String,
	pub(crate) target_profile_path: String,
	pub(crate) target_world_folder: String,
	pub(crate) created: i64,
}

pub(crate) async fn list_for_profile(
	pool: &SqlitePool,
	profile_path: &str,
) -> crate::Result<Vec<ProfileSharedWorldLinkRow>> {
	let rows = sqlx::query(
		r#"SELECT profile_path, local_world_folder, target_profile_path, target_world_folder, created
           FROM profile_shared_world_links WHERE profile_path = ?"#,
	)
	.bind(profile_path)
	.fetch_all(pool)
	.await?;

	let mut out = Vec::with_capacity(rows.len());
	for r in rows {
		out.push(ProfileSharedWorldLinkRow {
			profile_path: r.try_get("profile_path")?,
			local_world_folder: r.try_get("local_world_folder")?,
			target_profile_path: r.try_get("target_profile_path")?,
			target_world_folder: r.try_get("target_world_folder")?,
			created: r.try_get("created")?,
		});
	}
	Ok(out)
}

pub(crate) async fn insert(
	pool: &SqlitePool,
	profile_path: &str,
	local_world_folder: &str,
	target_profile_path: &str,
	target_world_folder: &str,
	created: i64,
) -> crate::Result<()> {
	sqlx::query(
		r#"INSERT INTO profile_shared_world_links (
            profile_path, local_world_folder, target_profile_path, target_world_folder, created
        ) VALUES (?, ?, ?, ?, ?)"#,
	)
	.bind(profile_path)
	.bind(local_world_folder)
	.bind(target_profile_path)
	.bind(target_world_folder)
	.bind(created)
	.execute(pool)
	.await?;

	Ok(())
}

pub(crate) async fn delete(
	pool: &SqlitePool,
	profile_path: &str,
	local_world_folder: &str,
) -> crate::Result<u64> {
	let res = sqlx::query(
		r#"DELETE FROM profile_shared_world_links WHERE profile_path = ? AND local_world_folder = ?"#,
	)
	.bind(profile_path)
	.bind(local_world_folder)
	.execute(pool)
	.await?;

	Ok(res.rows_affected())
}
