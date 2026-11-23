CREATE TABLE IF NOT EXISTS records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  module VARCHAR(32) NOT NULL,
  kind VARCHAR(64) NOT NULL,
  title VARCHAR(160) NOT NULL,
  notes TEXT NOT NULL,
  status ENUM('planned','in_progress','done') NOT NULL DEFAULT 'planned',
  amount DECIMAL(14,2) NULL,
  due_at DATETIME NULL,
  recurrence ENUM('none','weekly','monthly','yearly') NOT NULL DEFAULT 'none',
  next_alert_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX records_module (module, id),
  INDEX records_alert (next_alert_at)
);

CREATE TABLE IF NOT EXISTS alerts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  record_id INT UNSIGNED NOT NULL,
  occurrence_at DATETIME NOT NULL,
  title VARCHAR(160) NOT NULL,
  read_at DATETIME NULL,
  UNIQUE KEY alert_occurrence (record_id, occurrence_at),
  CONSTRAINT alert_record FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE
);
