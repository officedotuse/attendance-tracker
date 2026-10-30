<div align="center">

# 📅 Attendance Tracker

**A flexible, team-based attendance management system**

![HTML](https://img.shields.io/badge/HTML-5-E34F26?logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)
![Supabase](https://img.shields.io/badge/Backend-Supabase-3FCF8E?logo=supabase&logoColor=white)
![Hosting](https://img.shields.io/badge/Hosting-Static_Site-555555)

[Explore features](#-features) · [Set up locally](#-local-setup) · [Test permissions](#-suggested-testing-checklist) · [Troubleshooting](#-troubleshooting)

</div>

---

A responsive, browser-based attendance management system for organizations with multiple teams. It combines monthly and yearly attendance views, team-based access control, employee management, reporting, and secure account administration.

Built with **HTML, CSS, JavaScript, and Supabase**. The frontend can run locally or be published as a static website.

## 🧭 Table of contents

- [✨ Features](#-features)
  - [Attendance dashboard](#attendance-dashboard)
  - [Employee management](#employee-management)
  - [Team management](#team-management)
  - [User and role management](#user-and-role-management)
- [🔐 Access control](#-access-control)
- [🧰 Technology stack](#-technology-stack)
- [📁 Project structure](#-project-structure)
- [🚀 Local setup](#-local-setup)
- [✅ Suggested testing checklist](#-suggested-testing-checklist)
- [🌐 Deployment](#-deployment)
- [🛡️ Security notes](#-security-notes)
- [🧯 Troubleshooting](#-troubleshooting)
- [🎨 Customization](#-customization)
- [🤝 Contributing](#-contributing)
- [📜 License](#-license)

---

## ✨ Features

### Attendance dashboard
- View attendance by **month** or **year**.
- Filter by team or view the entire organization when authorized.
- Search employees and review summary counts.
- Display calendar dates with weekday labels for easier navigation.
- Record attendance using configurable status codes, including present, absent, weekly off, holidays, leave, and other attendance categories.
- Export attendance reports in **CSV** and **Excel** formats.

### Employee management
- Add and edit employees, including name, designation, team, joining date, and optional last working date.
- Assign or transfer employees between teams.
- Manage date-based employee exclusions without deleting historical attendance.
- Keep attendance history available across employment and exclusion periods.

### Team management
- Create teams with descriptions.
- Assign existing employees to teams.
- Select a team leader from the employee directory.
- View and edit team membership through an administrative interface.

### User and role management
- Link application accounts to employee records.
- Create accounts using **email invitations** or **administrator-defined initial passwords**.
- Assign application roles and team access.
- Edit account email addresses, reset passwords, and mark accounts active or inactive.
- Show only authorized actions to each signed-in user.

## 🔐 Access control

| Role | Typical permissions |
| --- | --- |
| Administrator | Manage organization-wide attendance, employees, teams, users, and permissions. |
| Team Leader | Edit attendance for their assigned team; access is linked to their login account. |
| HR/Administration Team Leader | Manage employees, exclusions, and team assignments; view organization-wide attendance, while editing attendance only for their assigned team. |
| HR Viewer | View organization-wide attendance without editing. |
| User | View attendance permitted by their assigned access; no editing rights. |

Authorization must be enforced **in Supabase**, using Row Level Security (RLS) and appropriately secured database functions—not only by hiding frontend controls.

## 🧰 Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML, CSS, JavaScript |
| Authentication | Supabase Auth |
| Database | Supabase PostgreSQL |
| Authorization | RLS and PostgreSQL functions |
| Privileged account operations | Supabase Edge Functions |
| Hosting | Static hosting such as GitHub Pages |

## 📁 Project structure

A typical project layout is:

```text
attendance-tracker/
├── index.html
├── style.css
├── app.js
├── config.example.js
├── config.js                 # Local environment-specific configuration
├── companylogo.png           # Optional branding asset
├── *.sql                     # Database setup and migration scripts
├── supabase/
│   └── functions/
│       └── admin-users/
│           └── index.ts
└── README.md
```

The exact migration filenames may vary by release. Apply them in the order documented with your version of the project.

## 🚀 Local setup

> [!TIP]
> **First time here?** Follow the six steps below in order, using a separate test Supabase project. The expandable tips provide extra context without cluttering the main instructions.


### 1. Create a Supabase test project

Create a **separate test project** in the [Supabase Dashboard](https://supabase.com/dashboard). Avoid testing new migrations or access policies directly against a live attendance database.

### 2. Initialize the database

In **Supabase → SQL Editor**, run the schema and migration scripts supplied with your project version, in their documented order. Configure teams, sample employees, test accounts, and roles before enabling restrictive access policies.

> Review every SQL script before execution. Back up any existing data and verify that your schema matches the expected migration prerequisites.

### 3. Configure the frontend

Create or update `config.js` with the **test** project's URL and public/publishable key:

```javascript
window.APP_CONFIG = {
  supabaseUrl: "https://YOUR-TEST-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-PUBLISHABLE-OR-ANON-KEY"
};
```

**Never** place a Supabase service-role key, secret key, or database password in frontend files or commit them to a public repository.

### 4. Deploy the account-management function

Deploy the supplied `supabase/functions/admin-users/index.ts` code as an Edge Function named `admin-users` in the **test** project. Verify that it performs server-side authentication and administrator authorization checks before using privileged Auth APIs.

The function name must match the name used by the frontend. Configure required server-side environment variables through Supabase, not in browser code.

### 5. Start the local website

<details>
<summary><strong>🪟 Windows quick start (PowerShell)</strong></summary>

Open PowerShell in the project directory and run:

```powershell
py -m http.server 5500
```

Then visit `http://localhost:5500/`.

</details>


From the project folder, run:

```bash
python -m http.server 5500
```

Open `http://localhost:5500/` in a browser. Alternatively, use a local static development server such as VS Code Live Server.

Configure the local URL in **Supabase Authentication → URL Configuration** when testing email invitations and password recovery redirects.

### 6. Verify permissions

Test with separate administrator, team leader, HR viewer, and standard user accounts. Confirm both that unauthorized editing controls are hidden **and** that unauthorized database requests are rejected.

## ✅ Suggested testing checklist

- [ ] Sign in and sign out with test accounts.
- [ ] Confirm monthly and yearly attendance views.
- [ ] Save attendance and verify it persists after refresh.
- [ ] Filter attendance by team and organization.
- [ ] Add, rename, and reassign sample employees.
- [ ] Create and edit teams; assign team leaders.
- [ ] Create accounts using invitation and initial-password workflows.
- [ ] Change roles and verify access after signing in again.
- [ ] Reset passwords and test active/inactive account behavior.
- [ ] Confirm team leaders cannot edit other teams' attendance.
- [ ] Verify CSV and Excel exports.
- [ ] Test responsive layouts and keyboard navigation.

## 🌐 Deployment

1. Complete all tests against a separate Supabase environment.
2. Back up the production database.
3. Review and apply only the required production migrations.
4. Deploy and validate the production Edge Function.
5. Configure the frontend with the **production project's public credentials**.
6. Publish the static frontend through your chosen hosting provider.
7. Verify role-based access after deployment.

> The frontend and Supabase project are configured separately. Running the website locally does **not** isolate it from production if `config.js` still points to the production project.

## 🛡️ Security notes

- Use Supabase Auth for identity and RLS for database access.
- Validate administrative permissions on the server for account creation, invitations, email changes, and password resets.
- Keep privileged credentials out of browser code and public repositories.
- Audit account status changes, team assignments, and role updates.
- Treat password recovery links and initial credentials as sensitive.
- Review whether disabling a user also prevents access from existing sessions; frontend-only restrictions are insufficient.

## 🧯 Troubleshooting

<details>
<summary><strong>🔍 Debugging workflow: where to look first</strong></summary>

1. Open your browser's Developer Tools (`F12`) and check **Console**.
2. Open **Network**, reproduce the issue, and inspect the failing request.
3. Confirm `config.js` points to the intended Supabase project.
4. For account operations, check **Supabase → Edge Functions → Logs**.
5. For database operations, check table permissions, RLS policies, and RPC errors.

</details>


**Teams appear in dropdowns but not in the directory:** Check the teams query, RLS read policies, and browser console errors.

**Account-management request fails:** Confirm the `admin-users` function is deployed in the project referenced by `config.js`. Check the browser Network panel, function logs, CORS behavior, and authentication.

**Attendance does not appear after refreshing:** Verify the saved database row, RLS policies, and pagination when reading large attendance datasets.

**Invitations or password recovery emails do not arrive:** Check Supabase Auth URL configuration, email provider settings, and delivery logs.

## 🎨 Customization

Adapt the team names, attendance status codes, organization branding, role policies, and reporting options to your environment. Review database policies whenever introducing a new role or permission.

## 🤝 Contributing

Contributions and suggestions are welcome. For significant changes, open an issue describing the use case and expected behavior. Test database migrations and authorization changes in an isolated environment before proposing deployment.

## 📜 License

No license is specified in this README. Add a `LICENSE` file if you intend to grant others permission to reuse, modify, or distribute the project.

---

<div align="center">

**Build · Test · Secure · Deploy**

[⬆ Back to top](#-attendance-tracker)

</div>
