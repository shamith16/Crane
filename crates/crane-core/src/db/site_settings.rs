use crate::db::Database;
use crate::types::{CraneError, FileCategory};
use rusqlite::params;

/// Per-domain download preferences.
#[derive(Debug, Clone)]
pub struct SiteSettings {
    pub domain: String,
    pub connections: Option<u32>,
    pub save_folder: Option<String>,
    pub category: Option<FileCategory>,
    pub user_agent: Option<String>,
    pub created_at: String,
}

impl Database {
    /// Insert or update site settings for a domain.
    ///
    /// On conflict (same domain), all fields are updated to the new values.
    pub fn upsert_site_settings(&self, settings: &SiteSettings) -> Result<(), CraneError> {
        self.conn()
            .execute(
                "INSERT INTO site_settings (domain, connections, save_folder, category, user_agent, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(domain) DO UPDATE SET
                     connections = excluded.connections,
                     save_folder = excluded.save_folder,
                     category = excluded.category,
                     user_agent = excluded.user_agent",
                params![
                    settings.domain,
                    settings.connections.map(|v| v as i64),
                    settings.save_folder,
                    settings.category.as_ref().map(|c| c.as_str()),
                    settings.user_agent,
                    settings.created_at,
                ],
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        Ok(())
    }

    /// Get site settings for a domain, or None if not configured.
    pub fn get_site_settings(&self, domain: &str) -> Result<Option<SiteSettings>, CraneError> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "SELECT domain, connections, save_folder, category, user_agent, created_at
                 FROM site_settings
                 WHERE domain = ?1",
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        let mut rows = stmt
            .query_map(params![domain], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<i64>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| CraneError::Database(e.to_string()))?;

        match rows.next() {
            Some(result) => {
                let (domain, connections, save_folder, category_str, user_agent, created_at) =
                    result.map_err(|e| CraneError::Database(e.to_string()))?;

                let category = match category_str {
                    Some(s) => Some(FileCategory::from_db_str(&s)?),
                    None => None,
                };

                Ok(Some(SiteSettings {
                    domain,
                    connections: connections.map(|v| v as u32),
                    save_folder,
                    category,
                    user_agent,
                    created_at,
                }))
            }
            None => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::FileCategory;

    #[test]
    fn test_upsert_and_get_site_settings() {
        let db = Database::open_in_memory().unwrap();

        let settings = SiteSettings {
            domain: "example.com".to_string(),
            connections: Some(16),
            save_folder: Some("/downloads/example".to_string()),
            category: Some(FileCategory::Software),
            user_agent: Some("CraneBot/1.0".to_string()),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        db.upsert_site_settings(&settings).unwrap();

        let fetched = db.get_site_settings("example.com").unwrap().unwrap();
        assert_eq!(fetched.domain, "example.com");
        assert_eq!(fetched.connections, Some(16));
        assert_eq!(fetched.save_folder.as_deref(), Some("/downloads/example"));
        assert_eq!(fetched.category.unwrap(), FileCategory::Software);
        assert_eq!(fetched.user_agent.as_deref(), Some("CraneBot/1.0"));
    }

    #[test]
    fn test_upsert_updates_existing() {
        let db = Database::open_in_memory().unwrap();

        let settings_v1 = SiteSettings {
            domain: "example.com".to_string(),
            connections: Some(8),
            save_folder: None,
            category: None,
            user_agent: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };
        db.upsert_site_settings(&settings_v1).unwrap();

        // Update with new values
        let settings_v2 = SiteSettings {
            domain: "example.com".to_string(),
            connections: Some(32),
            save_folder: Some("/new/path".to_string()),
            category: Some(FileCategory::Video),
            user_agent: Some("NewAgent/2.0".to_string()),
            created_at: "2026-02-01T00:00:00Z".to_string(), // should NOT overwrite
        };
        db.upsert_site_settings(&settings_v2).unwrap();

        let fetched = db.get_site_settings("example.com").unwrap().unwrap();
        assert_eq!(fetched.connections, Some(32));
        assert_eq!(fetched.save_folder.as_deref(), Some("/new/path"));
        assert_eq!(fetched.category.unwrap(), FileCategory::Video);
        assert_eq!(fetched.user_agent.as_deref(), Some("NewAgent/2.0"));
        // created_at should be the original value (INSERT's value, not excluded)
        assert_eq!(fetched.created_at, "2026-01-01T00:00:00Z");
    }

    #[test]
    fn test_get_missing_site_settings() {
        let db = Database::open_in_memory().unwrap();

        let result = db.get_site_settings("nonexistent.com").unwrap();
        assert!(result.is_none());
    }
}
