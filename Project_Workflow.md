# Abhishek's Vehicle Portfolio - Project Workflow & Architecture

This document provides a comprehensive overview of the Fleet Management System (Vehicle Portfolio). It explains the core workflows, user roles, database architecture, and a detailed breakdown of what every single file in the project does.

---

## 1. Core User Roles & Workflow

The system is designed for two main types of users: **Owners** (Fleet Managers) and **Drivers**. The Drivers are further divided into two states: Independent Job Seekers and Hired (Captive) Drivers.

### **Owner Workflow**
1. **Registration/Login:** Owners register or log in via the main portal (`index.html`).
2. **Dashboard Management:** They land on the main `dashboard.html` where they can view total active vehicles, trips, and revenue charts.
3. **Adding Vehicles:** Owners register their trucks/vans in the system.
4. **Hiring Drivers:** 
   - Owners can navigate to **Hire Drivers** to search for independent drivers looking for work.
   - They review the driver's profile, uploaded license, and send a **Job Request**.
5. **Managing Fleet:** Once a driver accepts, they appear in **My Drivers**. The owner assigns them a specific vehicle.
6. **Tracking Operations:** The owner reviews Trips, Diesel bills, and Service maintenance logged by their drivers. The **Finance** module automatically calculates total profit/loss per vehicle based on these records.

### **Driver Workflow**
1. **Job Registration:** An independent driver registers via the **Hire Jobs** tab, providing their details, expected salary, and uploading their profile photo and driving license (`driver-register.html`).
2. **Job Application Portal:** The driver logs in and lands on the `driver-dashboard.html`. They can set their availability to "Available" and review incoming job requests from owners.
3. **Accepting a Job:** When they click "Accept" on a job offer, they are instantly assigned to that Owner and their status changes to "On Duty".
4. **Hired Driver Operations:** The next time the driver logs in, the system intelligently redirects them to the main `dashboard.html` (instead of the job portal). Here, they can view the vehicle assigned to them by their new owner and start logging **Trips**, **Diesel Fills**, and **Service Records**.

---

## 2. Directory & File Breakdown

The project follows a standard Client-Server architecture. The `frontend/` handles the UI and user interactions, while the `backend/` handles business logic, database queries, and file uploads.

### 📂 `backend/` (Node.js & Express API)

#### Core Configuration
* **`server.js`**: The main entry point of the backend application. It initializes the Express server, configures CORS, serves static uploaded files, and registers all API routes.
* **`config/db.js`**: Establishes a connection pool to the MySQL database using `mysql2/promise`.
* **`database/setup.js`**: Contains the SQL schema definitions. Running this script creates all necessary tables (users, vehicles, trips, jobs, etc.) to bootstrap a fresh database.
* **`middleware/auth.js`**: Contains the `verifyToken` middleware. It intercepts incoming API requests, reads the JWT (JSON Web Token), and ensures the user is authenticated before allowing them to fetch or modify data.

#### API Routes (`backend/routes/`)
* **`auth.js`**: Manages user authentication (Login/Registration). It also includes endpoints for the Owner to list their hired drivers and assign vehicles to them.
* **`drivers.js`**: Handles the public registration of Independent Drivers (processing their form data and file uploads). It also contains the search engine endpoint used by owners to filter available drivers by location, experience, and vehicle type.
* **`jobs.js`**: Manages the hiring workflow. It allows Owners to send job requests to drivers, and allows Drivers to fetch their pending requests, accept them, or reject them.
* **`vehicles.js`**: CRUD (Create, Read, Update, Delete) operations for the fleet's vehicles. 
* **`trips.js`**: Manages the lifecycle of a transport trip. Drivers start a trip, log the source/destination, and mark it completed with the final freight amount.
* **`diesel.js` & `service.js`**: Endpoints to log operational expenses. Drivers or owners record fuel fill-ups and maintenance repairs, which are tied to specific vehicles.
* **`finance.js`**: The financial engine. It aggregates data from `trips`, `diesel`, and `service` to calculate total revenue, total expenses, driver salaries, and net profit per vehicle.
* **`analytics.js`**: Provides aggregated data points (e.g., monthly revenue trends) formatted specifically for rendering charts on the frontend dashboard.
* **`uploads.js`**: A centralized file-handling module utilizing `multer`. It processes multipart-form data to securely save images and documents (like bills or profile photos) to the server's disk.
* **`reviews.js`**: Allows owners to leave 1-5 star ratings and reviews for drivers based on their performance.

---

### 📂 `frontend/` (HTML, CSS, Vanilla JavaScript)

#### Public Pages
* **`index.html`**: The unified login portal. It features dynamic tabs for Owners, Captive Drivers, and Independent Job Seekers. It contains the intelligent redirection logic that routes a user to the correct dashboard based on their role and employment status.
* **`driver-register.html`**: A comprehensive registration form for job-seeking drivers. It uses JavaScript `FormData` to securely transmit text data along with photo and license document uploads to the backend.

#### Owner & Driver Portals
* **`dashboard.html`**: The primary operational dashboard. For owners, it shows high-level fleet statistics and charts. For hired drivers, it displays their assigned vehicle and shortcuts to log trips.
* **`driver-dashboard.html`**: The Job Portal specifically for Independent Drivers. It allows them to toggle their job-seeking status and manage incoming job requests.
* **`hire-drivers.html`**: The Owner's driver discovery page. It fetches the list of available independent drivers, renders their profile cards (including photos and links to view their licenses), and provides the modal to send a job offer.
* **`add-vehicle.html`**: Form for owners to add new trucks/vans to their fleet.
* **`trips.html`, `diesel.html`, `service.html`**: Data entry and tabular view pages for managing the core operational records of the fleet.
* **`finance.html`**: A financial reporting page that displays a clear breakdown of income and expenses per vehicle.
* **`analytics.html`**: A visual reporting page utilizing Chart.js to render interactive graphs of fleet performance.
* **`uploads.html`**: A document management page where owners can review uploaded physical bills (e.g., fuel receipts, load weighbridge tickets).

#### Assets & Logic
* **`css/style.css`**: Global CSS styling. It defines CSS variables for colors, handles dark/light theme switching, and provides custom overrides for Bootstrap.
* **`js/config.js`**: Contains global JavaScript configurations, such as the `API_BASE_URL` used by all fetch requests.
* **`js/dashboard.js`**: The core frontend logic for the main dashboard. It handles fetching analytics data, initializing charts, and rendering the "My Drivers" list.

---

## 3. Technology Stack Summary

* **Frontend:** HTML5, CSS3, Vanilla JavaScript, Bootstrap 5 (Styling & Layout), Chart.js (Data Visualization).
* **Backend:** Node.js, Express.js.
* **Database:** MySQL.
* **Security & Auth:** JSON Web Tokens (JWT) for stateless session management, Bcrypt for secure password hashing.
* **File Uploads:** Multer (Node.js middleware).
