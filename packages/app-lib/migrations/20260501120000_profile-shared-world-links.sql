CREATE TABLE profile_shared_world_links (
    profile_path TEXT NOT NULL,
    local_world_folder TEXT NOT NULL,
    target_profile_path TEXT NOT NULL,
    target_world_folder TEXT NOT NULL,
    created INTEGER NOT NULL,

    PRIMARY KEY (profile_path, local_world_folder),
    FOREIGN KEY (profile_path) REFERENCES profiles(path) ON DELETE CASCADE,
    FOREIGN KEY (target_profile_path) REFERENCES profiles(path) ON DELETE CASCADE
);

CREATE INDEX profile_shared_world_links_by_target ON profile_shared_world_links(target_profile_path);
