pub mod types;

pub use types::*;

use crate::types::CraneError;
use std::path::{Path, PathBuf};

/// Manages loading, saving, updating, and exporting TOML configuration.
pub struct ConfigManager {
    path: PathBuf,
    config: AppConfig,
}

impl ConfigManager {
    /// Load config from `path`. Creates a default config file if it doesn't exist.
    pub fn load(path: &Path) -> Result<Self, CraneError> {
        if path.exists() {
            let contents = std::fs::read_to_string(path).map_err(|e| {
                CraneError::Config(format!("Failed to read config at {}: {e}", path.display()))
            })?;
            let config: AppConfig = toml::from_str(&contents).map_err(|e| {
                CraneError::Config(format!("Failed to parse config at {}: {e}", path.display()))
            })?;
            Ok(Self {
                path: path.to_path_buf(),
                config,
            })
        } else {
            let manager = Self {
                path: path.to_path_buf(),
                config: AppConfig::default(),
            };
            manager.save()?;
            Ok(manager)
        }
    }

    /// Write the current config to the file path.
    pub fn save(&self) -> Result<(), CraneError> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                CraneError::Config(format!(
                    "Failed to create config directory {}: {e}",
                    parent.display()
                ))
            })?;
        }
        let toml_str = toml::to_string_pretty(&self.config)
            .map_err(|e| CraneError::Config(format!("Failed to serialize config: {e}")))?;
        std::fs::write(&self.path, toml_str).map_err(|e| {
            CraneError::Config(format!(
                "Failed to write config to {}: {e}",
                self.path.display()
            ))
        })?;
        Ok(())
    }

    /// Returns a reference to the current configuration.
    pub fn get(&self) -> &AppConfig {
        &self.config
    }

    /// Deep-merge a partial JSON value into the current config and save.
    ///
    /// Example: `{"downloads": {"default_connections": 16}}` updates only that field.
    pub fn update(&mut self, partial: serde_json::Value) -> Result<(), CraneError> {
        let mut current = serde_json::to_value(&self.config)
            .map_err(|e| CraneError::Config(format!("Failed to serialize current config: {e}")))?;
        merge_json(&mut current, partial);
        self.config = serde_json::from_value(current)
            .map_err(|e| CraneError::Config(format!("Failed to apply config update: {e}")))?;
        self.save()
    }

    /// Reset configuration to defaults and save.
    pub fn reset(&mut self) -> Result<(), CraneError> {
        self.config = AppConfig::default();
        self.save()
    }

    /// Export the current config to a different file path.
    pub fn export_to(&self, path: &Path) -> Result<(), CraneError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                CraneError::Config(format!(
                    "Failed to create export directory {}: {e}",
                    parent.display()
                ))
            })?;
        }
        let toml_str = toml::to_string_pretty(&self.config)
            .map_err(|e| CraneError::Config(format!("Failed to serialize config: {e}")))?;
        std::fs::write(path, toml_str).map_err(|e| {
            CraneError::Config(format!(
                "Failed to export config to {}: {e}",
                path.display()
            ))
        })?;
        Ok(())
    }

    /// Import config from a different file path and save to the main path.
    pub fn import_from(&mut self, path: &Path) -> Result<(), CraneError> {
        let contents = std::fs::read_to_string(path).map_err(|e| {
            CraneError::Config(format!(
                "Failed to read import file {}: {e}",
                path.display()
            ))
        })?;
        self.config = toml::from_str(&contents).map_err(|e| {
            CraneError::Config(format!(
                "Failed to parse import file {}: {e}",
                path.display()
            ))
        })?;
        self.save()
    }

    /// Returns the config file path.
    pub fn path(&self) -> &Path {
        &self.path
    }
}

/// Recursively deep-merge `source` into `target`.
/// - For objects: merge keys recursively.
/// - For all other types: `source` overwrites `target`.
fn merge_json(target: &mut serde_json::Value, source: serde_json::Value) {
    use serde_json::Value;
    match (target, source) {
        (Value::Object(ref mut target_map), Value::Object(source_map)) => {
            for (key, source_val) in source_map {
                let entry = target_map.entry(key).or_insert(Value::Null);
                merge_json(entry, source_val);
            }
        }
        (target, source) => {
            *target = source;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_load_creates_default_when_missing() {
        let tmp = TempDir::new().unwrap();
        let config_path = tmp.path().join("crane").join("config.toml");

        assert!(!config_path.exists());
        let manager = ConfigManager::load(&config_path).unwrap();
        assert!(config_path.exists());

        let cfg = manager.get();
        assert_eq!(cfg.downloads.default_connections, 8);
        assert_eq!(cfg.downloads.max_concurrent, 3);
        assert!(cfg.downloads.auto_resume);
        assert_eq!(cfg.appearance.theme, Theme::Dark);
        assert_eq!(cfg.general.language, "en");
        assert!(cfg.general.minimize_to_tray);
    }

    #[test]
    fn test_load_reads_existing_config() {
        let tmp = TempDir::new().unwrap();
        let config_path = tmp.path().join("config.toml");

        let partial_toml = r#"
[downloads]
default_connections = 4
max_concurrent = 5

[appearance]
theme = "light"
"#;
        std::fs::write(&config_path, partial_toml).unwrap();

        let manager = ConfigManager::load(&config_path).unwrap();
        let cfg = manager.get();

        // Explicitly set values
        assert_eq!(cfg.downloads.default_connections, 4);
        assert_eq!(cfg.downloads.max_concurrent, 5);
        assert_eq!(cfg.appearance.theme, Theme::Light);

        // Defaults for unset values
        assert!(cfg.downloads.auto_resume);
        assert_eq!(cfg.general.language, "en");
        assert_eq!(cfg.appearance.accent_color, "#3B82F6");
    }

    #[test]
    fn test_save_roundtrip() {
        let tmp = TempDir::new().unwrap();
        let config_path = tmp.path().join("config.toml");

        let manager = ConfigManager::load(&config_path).unwrap();
        manager.save().unwrap();

        let manager2 = ConfigManager::load(&config_path).unwrap();
        let c1 = manager.get();
        let c2 = manager2.get();

        assert_eq!(
            c1.downloads.default_connections,
            c2.downloads.default_connections
        );
        assert_eq!(c1.downloads.max_concurrent, c2.downloads.max_concurrent);
        assert_eq!(c1.appearance.theme, c2.appearance.theme);
        assert_eq!(c1.general.language, c2.general.language);
        assert_eq!(c1.network.proxy.mode, c2.network.proxy.mode);
    }

    #[test]
    fn test_update_partial() {
        let tmp = TempDir::new().unwrap();
        let config_path = tmp.path().join("config.toml");

        let mut manager = ConfigManager::load(&config_path).unwrap();
        assert_eq!(manager.get().downloads.default_connections, 8);

        let partial = serde_json::json!({
            "downloads": {
                "default_connections": 16
            }
        });
        manager.update(partial).unwrap();

        assert_eq!(manager.get().downloads.default_connections, 16);
        // Other fields unchanged
        assert_eq!(manager.get().downloads.max_concurrent, 3);
        assert!(manager.get().downloads.auto_resume);
        assert_eq!(manager.get().appearance.theme, Theme::Dark);
    }

    #[test]
    fn test_reset() {
        let tmp = TempDir::new().unwrap();
        let config_path = tmp.path().join("config.toml");

        let mut manager = ConfigManager::load(&config_path).unwrap();
        manager
            .update(serde_json::json!({
                "downloads": { "default_connections": 32 },
                "appearance": { "theme": "light" }
            }))
            .unwrap();

        assert_eq!(manager.get().downloads.default_connections, 32);
        assert_eq!(manager.get().appearance.theme, Theme::Light);

        manager.reset().unwrap();
        assert_eq!(manager.get().downloads.default_connections, 8);
        assert_eq!(manager.get().appearance.theme, Theme::Dark);

        // Verify persisted to disk
        let reloaded = ConfigManager::load(&config_path).unwrap();
        assert_eq!(reloaded.get().downloads.default_connections, 8);
    }

    #[test]
    fn test_export_import() {
        let tmp = TempDir::new().unwrap();
        let config_path = tmp.path().join("config.toml");
        let export_path = tmp.path().join("exported.toml");

        let mut manager = ConfigManager::load(&config_path).unwrap();
        manager
            .update(serde_json::json!({
                "appearance": { "theme": "light" }
            }))
            .unwrap();
        assert_eq!(manager.get().appearance.theme, Theme::Light);

        manager.export_to(&export_path).unwrap();
        assert!(export_path.exists());

        // Create a fresh manager with defaults
        let fresh_path = tmp.path().join("fresh_config.toml");
        let mut fresh_manager = ConfigManager::load(&fresh_path).unwrap();
        assert_eq!(fresh_manager.get().appearance.theme, Theme::Dark);

        // Import from exported file
        fresh_manager.import_from(&export_path).unwrap();
        assert_eq!(fresh_manager.get().appearance.theme, Theme::Light);
    }
}
