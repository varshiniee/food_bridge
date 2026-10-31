# Food Bridge

## 1. Run the website (no install needed)
Open `index.html` in a browser. It uses React and Tailwind from CDNs and needs internet.
Login, requests, reviews, partner forms and contact messages are saved in your browser (localStorage) so the whole site works as a demo.

## 2. Run the backend (Express + MongoDB)
```
cd backend
npm install
cp .env.example .env     # set a long random JWT_SECRET
mkdir uploads
npm run dev
```
Needs MongoDB running locally or an Atlas URI in `MONGO_URI`.

### API summary
| Method | Route | Who |
|---|---|---|
| POST | /api/auth/register, /api/auth/login | everyone |
| GET | /api/foods?q=&category= | everyone |
| POST | /api/foods | verified Restaurant |
| POST | /api/requests | Receiver / NGO. Body: `foodId, quantity, address, phone, lat, lng`. Reserves the quantity and returns `etaMinutes` |
| GET | /api/requests/mine, /incoming | logged in / Restaurant |
| PATCH | /api/requests/:id | Restaurant (approve / reject) |
| POST | /api/partners | everyone (multipart with `document`) |
| GET/POST | /api/reviews, POST /api/contact | everyone |
| GET/PATCH | /api/admin/* | Admin (verify restaurants and NGOs, stats) |

To make an admin, change a user's `role` to `Admin` directly in MongoDB (signup can never create admins).

## 3. Next steps
- Replace the emoji tiles with real photos (use your own or free sources like Unsplash/Pexels).
- Convert `index.html` into a Vite + React project and call the API with `fetch` and the JWT.
- Build role dashboards (Restaurant: listings and incoming requests; Receiver: my requests; Admin: pending verifications) using the endpoints above.
