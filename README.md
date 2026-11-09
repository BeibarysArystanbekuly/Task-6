# Itemspace

A React collection manager with reusable item cards, asynchronous CRUD, search,
category/status/priority filters, sorting, pagination, and seven-field item details.
The fake API persists changes in localStorage and
simulates loading delays and occasional failures; failed requests can be retried.

## Development

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
npm run build
npm run preview
npm run lint
npm test
```

## Architecture

- `src/App.jsx`: route definitions and lazy page imports.
- `src/layouts/RootLayout.jsx`: persistent page shell, NavBar, Suspense, and Outlet.
- `src/pages/`: Home, About, Items, Item Details, Dashboard, Login, Signup, Profile,
  and Not Found.
- `src/components/`: reusable navigation, loading state, and item editor.
- `src/hooks/`: URL-backed collection queries and asynchronous list requests.
- `src/services/service.js`: the application API boundary; pages and components
  never import the fake API directly.
- `src/api/`: fake backend, configuration, and seed data.
- `src/styles/`: shared global and responsive application styles.

The items page is a nested layout: `/items/new` and `/items/:id` render in its
Outlet beside the collection. Existing create, update, complete, delete, error,
and retry behavior remains available. Search, sort, page, and page size are URL
parameters, retained when opening and closing an item and using browser history.
Category, status, and priority filters are also synchronized with URL parameters.
The API applies search and all filters before sorting, counting, and paginating.
Changing a filter resets the page; clearing filters preserves sorting and page size.
Item details use the URL ID to load the API record and display its name, description,
category, status, priority, owner, and due date, together with its ID. Back returns
through in-app history (or to the filtered collection for direct entry); All Items
opens the unfiltered list. Loading and retryable failures are separate from missing
items, and superseded detail responses are ignored when the routed ID changes.
The dashboard API calculates total, completed, in-progress, high/urgent-priority,
and completion-rate statistics over the entire filtered collection. Category and
status breakdowns show counts and percentages and link to matching item lists.
Dashboard search and category/status/priority filters update every statistic and
remain in the URL. An alphabetical five-item preview links to item details;
refresh reloads the latest API data. Empty selections and request failures have
recovery actions, and stale dashboard responses are ignored.
Home includes a collection
illustration and navigation links; About describes the project. Login supports
email/password and Google popup sign-in at `/login`. `/signup` provides email,
password, confirmation, and validation. The protected `/profile` page displays the
user's email and UID, with logout. It waits for session restoration before
redirecting signed-out users to `/login`; signed-in users visiting `/login` or
`/signup` are redirected to `/profile`. Other collection pages remain public.
The navigation shows Login/Signup or Profile/Logout based on session state.
Requests disable
the controls while pending and display readable errors with retry support.
Collection data remains local to the browser and is not synced to an account.

## Authentication context

Copy `.env.example` to `.env.local`, enter your Firebase web configuration, and
restart Vite. `src/firebase.js` initializes Firebase Authentication.
`src/main.jsx` wraps the app in `AuthProvider`, which observes Firebase session
changes and removes its listener on unmount.
The provider explicitly enables Firebase's browser local persistence before
restoring the session, so sign-in survives refreshes and browser restarts when
browser storage is available. Persistence setup failures are exposed as errors.

Components import `useAuth` from `src/hooks/useAuth.js` to access `user` (the Firebase
user or `null`), `initializing` (session restoration), `authenticating` (pending
authentication requests), and `loading` (either state). Wait for `initializing`
to become false before treating `user === null` as signed out. The hook must be
used inside `AuthProvider`.

The context also exposes `signup(email, password)`, `login(email, password)`,
`loginWithGoogle()`, and `logout()`. These return Firebase promises; forms should
catch their rejections. `error` contains the latest request or setup error and
keeps its Firebase `code` and `message`. A new request clears the previous error;
`clearError()` dismisses it manually. Failed requests leave the current user intact.
Firebase's `onAuthStateChanged` observer updates the shared user after session
changes, including sign-out in another tab.

## Routes

All pages use `React.lazy` with a shared `Suspense` loading state. A nested
boundary keeps the collection visible while the item details module loads.
Unknown paths show a custom 404 with a Home link. Item IDs must be positive, safe
whole numbers in canonical decimal form: malformed links show an item 404 without
fetching an item. Valid IDs that are absent from the API show Item not found.

| Route | Page |
| --- | --- |
| `/` | Home |
| `/about` | About |
| `/items` | Items list |
| `/items/new` | Create item |
| `/items/:id` | Item details and editor |
| `/dashboard` | Dashboard |
| `/login` | Login |
| `/signup` | Signup |
| `/profile` | Profile (requires sign-in) |
| `*` | Not Found |

The app uses React Router's HashRouter. Direct links use hash paths such as
`/#/items/1` or `/#/items?search=medic&page=1&limit=5`. In-app Link/NavLink
navigation, nested routes, and browser Back/Forward work without document reloads.

## Verification

`npm test` runs the editor's controlled async regression cases and real React
Router integration tests covering direct URLs, remount/refresh behavior, history,
query parameters, 404 handling, CRUD, completion, stale responses, and API storage.
