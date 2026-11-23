# Life Dashboard

A private, single-workspace web app with 21 separate dashboards for personal, family, and business records. React and Material UI provide the interface. A Node.js/Express API stores entries in MySQL, and Python runs the reminder worker and module classifier.

## Run locally

Requires Docker with Docker Compose.

```sh
cp .env.example .env
```

Set three distinct passwords in `.env`. Use at least 16 characters for `DASHBOARD_PASSWORD`. Then start the app.

```sh
docker compose up --build -d
```

Open http://localhost:3000 and sign in with `DASHBOARD_USER` and `DASHBOARD_PASSWORD`. MySQL initializes the schema on first startup and stores data in a named volume. The published web port binds to loopback. Use an HTTPS reverse proxy if you expose the workspace remotely.

## Use the dashboard

- The overview links to all 21 modules. Each has its own categories, summary, searchable entries, and create, edit, and delete actions. Categories that track money use INR.
- In **Reminders and Recurring Payments**, choose EMI, bill, subscription, renewal, or alert, and enter the first due date. Choose one-time, weekly, monthly, or yearly recurrence. The Python worker delivers alerts to the dashboard inbox, which refreshes every 30 seconds. Alerts track due dates without initiating payments.
- Reminders preserve their original day where possible. For shorter months they fall on the last day. The worker emits one overdue alert after downtime and then resumes at the next future occurrence. Recurrences use UTC calendar calculations, and the browser displays dates in its local time zone.
- **Find the right module** runs a local multinomial Naive Bayes classifier. It uses the module descriptions, category labels, and up to 400 recent entry titles as labeled examples. Suggestions include matched terms. The model requires no API key and sends no data to an external model provider.

## Development

Use Node.js 22.12+ or 24, Python 3.10+, and MySQL 8.4. For a local MySQL server, create the database and application user, then apply `server/schema.sql` to the database before starting the API.

```sh
npm ci
npm test
npm run build
npm start
```

The server reads `.env` and defaults to port 3000 and MySQL at `127.0.0.1:3306`. Override `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_NAME` when needed. To run the worker outside Compose, install `jobs/requirements.txt` in a virtual environment, export the same database connection variables, then run `python3 jobs/reminders.py`.
