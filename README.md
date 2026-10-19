# Creative Desk

A MERN portal for running creative production between **Marketing**, **Media** (camera + graphic design) and **Editing**.

Marketing raises a creative requirement → it moves step by step through the teams (e.g. Shoot → Video edit) → when every step is done it lands in **Ready to post** → marketing marks it **Posted**. At any moment you can see where each creative is, who has it, and what is stuck.

## How the workflow works

| Creative type    | Steps (in order)                       |
|------------------|----------------------------------------|
| Video production | Shoot (Camera) → Video edit (Editing)  |
| Reel / short     | Shoot (Camera) → Video edit (Editing)  |
| Poster design    | Design (Graphic)                       |
| Carousel post    | Design (Graphic)                       |
| Photoshoot       | Shoot (Camera) → Photo retouch (Graphic) |
| Motion graphic   | Design (Graphic) → Animation (Editing) |

Steps can be added, removed or reordered per requirement on the create form. To change the defaults, edit `server/src/utils/workflows.js` (the client reads it from `/api/meta`).

**Each step goes through:** `Waiting` (earlier step not done) → `Not assigned` (team can pick it up) → `Assigned` → `In progress` → `Done`.

- **Take** – anyone in the step's team can take an unassigned step for themselves.
- **Assign / Reassign** – managers, admins, or anyone in that team can hand the step to a teammate. Later steps can be **assigned ahead** (e.g. pick the editor while the shoot is still happening); they go straight to that person when the previous step finishes.
- **Mark complete** – the assignee adds a file link and a note for the next team. The next step opens automatically.
- **Request changes** – marketing can send a creative back to any finished step; that step and every step after it run again with the same people.
- **Mark as posted** – once all steps are done, marketing marks it posted (optionally with the live post link).

## Roles

| Role    | Can do |
|---------|--------|
| Admin   | Everything, including deleting creatives and creating other admins |
| Manager | Add people, assign any step (or only their own team's steps if a team is set on the manager), raise requirements |
| Member (Marketing) | Raise requirements, edit their own, request changes, mark posted, cancel |
| Member (Camera / Graphic / Editing) | Take, assign within their team, start and complete steps |

## Screens

- **Overview** – the pipeline strip (in production → camera → graphic → editing → ready to post), items that are overdue or stuck, ready-to-post queue, who is working on what, average days per step.
- **Creatives** – board view by current team, or cards; filters for status, type, team and "mine".
- **Creative page** – the relay track, each step with its actions, brief, comments, history.
- **My work** – steps on you now, open steps your team can take, and what's coming up.
- **Team** – people grouped by team; leads can add, edit, deactivate and reset passwords.

Fully responsive: sidebar on desktop, bottom tab bar on phones.

## Run locally

Requirements: Node 18+, MongoDB (local or Atlas).

```bash
# 1. API
cd server
cp .env.example .env        # set MONGO_URI and JWT_SECRET
npm install
npm run seed                # optional: demo users + sample creatives (wipes the DB!)
npm run dev                 # http://localhost:5000

# 2. Client (new terminal)
cd client
npm install
npm run dev                 # http://localhost:5173  (proxies /api to :5000)
```

No seed? Open the app and the first screen lets you create the admin account. Then add people from **Team**.

Seed logins (password `password123`): `admin@studio.test`, `manager@studio.test`, `anu@studio.test` (marketing), `rahul@` / `vishnu@` (camera), `sneha@` (graphic), `arjun@` / `fathima@` (editing).

## Deploy (single service, e.g. Render)

The API serves the built client when `client/dist` exists.

- Build command: `cd client && npm install && npm run build && cd ../server && npm install`
- Start command: `cd server && npm start`
- Env vars: `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL` (your site URL)

To host the client separately (Vercel/Netlify), set `VITE_API_URL=https://your-api.example.com/api` before building, and add the client's URL to `CLIENT_URL` on the API.

## API summary

```
GET  /api/auth/status            POST /api/auth/setup   POST /api/auth/login
GET  /api/auth/me                PATCH /api/auth/password
GET  /api/meta                   teams, step library, creative types
GET  /api/stats                  dashboard numbers
GET  /api/tasks                  { mine, open, upcoming } for the signed-in user
GET  /api/users                  POST /api/users        PATCH /api/users/:id
GET  /api/creatives?status=&type=&team=&mine=&overdue=&q=&sort=
POST /api/creatives              GET/PATCH/DELETE /api/creatives/:id
POST /api/creatives/:id/stages/:idx/take | assign | unassign | start | complete
POST /api/creatives/:id/rework | posted | cancel | restore | comments
```

## Project structure

```
server/src
  index.js              express app, serves client/dist in production
  models/               User, Creative (stages, activity, comments), Counter (CR-0001 codes)
  routes/               auth, users, creatives, tasks, stats
  middleware/auth.js    JWT + permission helpers
  utils/workflows.js    teams, steps and creative types
  seed.js
client/src
  pages/                Login, Dashboard, Creatives, NewCreative, CreativeDetail, MyWork, Team
  components/           Layout, Relay (pipeline track), CreativeCard, ui
  context/              Auth, Toast
  styles.css            design tokens + responsive layout
```
