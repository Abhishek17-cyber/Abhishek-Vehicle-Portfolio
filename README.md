# 🚛 Abhishek's Vehicle Portfolio
### Fleet Management System — Full Stack Web Application

---

## 📁 Project Structure

```
vehicle-portfolio/
├── frontend/               ← Static files → Deploy to AWS S3
│   ├── index.html          ← Login page (3D themed)
│   ├── dashboard.html      ← Main dashboard with vehicle cards
│   ├── add-vehicle.html    ← Add new vehicle form
│   ├── vehicle-detail.html ← Vehicle detail + tabs (trips/diesel/service/docs)
│   ├── trips.html          ← Trip records (source/destination + toll)
│   ├── diesel.html         ← Diesel records (date/time/cost/route/bill upload)
│   ├── service.html        ← Service records + alerts
│   ├── uploads.html        ← Upload diesel bills, load bills, weight bills
│   ├── css/
│   │   ├── login.css       ← Login page styles (dark vehicle theme)
│   │   ├── style.css       ← Global styles (glassmorphism, buttons, tables)
│   │   └── dashboard.css   ← Layout, sidebar, navbar, cards
│   └── js/
│       ├── config.js       ← API_BASE_URL — update for EC2 deployment
│       ├── auth.js         ← JWT auth helpers + sidebar/navbar
│       ├── realtime.js     ← Polling-based live updates (5s interval)
│       ├── dashboard.js    ← Dashboard page logic
│       ├── vehicle.js      ← Add/edit/delete vehicle logic
│       ├── trips.js        ← Trips CRUD logic
│       ├── diesel.js       ← Diesel records CRUD logic
│       └── service.js      ← Service records + alert system
│
└── backend/                ← Node.js API → Deploy to AWS EC2
    ├── server.js           ← Express server entry point
    ├── package.json
    ├── .env                ← Environment variables (DB credentials etc.)
    ├── config/
    │   └── db.js           ← MySQL connection pool
    ├── middleware/
    │   └── auth.js         ← JWT middleware
    ├── routes/
    │   ├── auth.js         ← POST /api/auth/login
    │   ├── vehicles.js     ← CRUD /api/vehicles
    │   ├── trips.js        ← CRUD /api/trips
    │   ├── diesel.js       ← CRUD /api/diesel
    │   ├── service.js      ← CRUD /api/service + alerts
    │   └── uploads.js      ← POST /api/uploads (file uploads)
    └── database/
        └── setup.js        ← Run once to create DB schema + seed users
```

---

## 🚀 Local Development Setup

### Step 1: Install MySQL
Make sure MySQL is installed and running locally.

### Step 2: Configure .env
Edit `backend/.env`:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=vehicle_portfolio
JWT_SECRET=your_strong_secret_key_here
PORT=3000
FRONTEND_URL=http://localhost:5500
```

### Step 3: Install Backend Dependencies
```bash
cd backend
npm install
```

### Step 4: Create Database & Tables
```bash
npm run setup-db
```
This creates the database, all tables, and default users:
- `admin` / `admin123`
- `owner` / `owner123`
- `driver` / `driver123`

### Step 5: Start the Backend Server
```bash
npm start
# or for development with auto-reload:
npm run dev
```
Server runs on http://localhost:3000

### Step 6: Open the Frontend
Open `frontend/index.html` with a live server (e.g. VS Code Live Server on port 5500).

---

## ☁️ AWS Deployment

### Backend → EC2

1. Launch an EC2 instance (Amazon Linux 2 / Ubuntu)
2. Install Node.js 18+ and MySQL
3. Clone/copy the `backend/` folder to EC2
4. Set up `.env` with production values
5. Run `npm run setup-db` to create the database
6. Start with PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start server.js --name vehicle-portfolio
   pm2 startup
   pm2 save
   ```
7. Open port 3000 in EC2 Security Group (or use Nginx on port 80/443)

### Frontend → S3

1. Create an S3 bucket (e.g. `abhishek-vehicle-portfolio`)
2. Enable **Static Website Hosting**
3. Update `frontend/js/config.js`:
   ```javascript
   const API_BASE_URL = 'http://YOUR_EC2_PUBLIC_IP:3000';
   // or with custom domain: 'https://api.yourdomain.com'
   ```
4. Upload all files from `frontend/` to the S3 bucket
5. Set bucket policy for public read access
6. Access via: `http://your-bucket.s3-website.ap-south-1.amazonaws.com`

### CORS Configuration
Update `backend/.env`:
```env
FRONTEND_URL=http://your-bucket.s3-website.ap-south-1.amazonaws.com
```

---

## 🔐 Default Login Credentials

| Username | Password   | Role   |
|----------|------------|--------|
| admin    | admin123   | Admin  |
| owner    | owner123   | Owner  |
| driver   | driver123  | Driver |

**Important:** Change these passwords in production!

---

## ✨ Features

- 🚛 **Vehicle Management** — Add/edit/delete vehicles with full details
- 👤 **Owner & Driver Info** — Name, phone, address, salary
- 📐 **Vehicle Specs** — Registration number, make, model, year, length, weight, purchase date
- 🛣️ **Trip Records** — Source/destination, toll fees (up/down), load weight
- ⛽ **Diesel Tracking** — Date/time, cost, liters, pump station, trip route, bill image
- 🔧 **Service Reminders** — Alert popup & banner for upcoming/overdue service
- 📁 **Document Uploads** — Diesel bills, load bills, weight bills, vehicle photos
- 🔴 **Real-time Updates** — 5-second polling, both owner & driver see changes live
- 📱 **Responsive Design** — Works on mobile, tablet, and desktop
- 🔐 **JWT Authentication** — Secure login with token expiry
- 🌙 **Dark Vehicle Theme** — Glassmorphism, Orbitron font, 3D gold title

---

## 🗄️ Database Schema

| Table            | Purpose                          |
|------------------|----------------------------------|
| users            | Login accounts (admin/owner/driver) |
| vehicles         | Vehicle master data               |
| trips            | Trip records with toll details    |
| diesel_records   | Fuel refill records with bills    |
| service_records  | Service/maintenance history       |
| uploads          | Uploaded documents & bill images  |
