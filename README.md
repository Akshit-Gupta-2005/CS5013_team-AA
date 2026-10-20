# CS5013: Multi-Modal Transportation Data Fusion Tool
## Midterm Evaluation Deliverable — Sensor Stream Visualization & Exploratory Relationship Dashboard

**Academic Course:** CS5013 (Software Engineering for Transportation Systems)  
**Department:** Department of Civil Engineering, IIT Madras  
**Team AA:** 
- Akshit Gupta (`CE23B054`) — [GitHub](https://github.com/Akshit-Gupta-2005)
- Ayush Shukla (`CE23B057`) — [GitHub](https://github.com/AyushShukla761)  
**Project Stakeholder:** Dr. Karthik K. Srinivasan (Faculty, Civil Engineering, IIT Madras)

---

## 1. Project Overview

This application implements the midterm milestone for the **Multi-Modal Transportation Data Fusion Tool**, adhering strictly to the architecture laid out in [`CS5013_Phase3_Design_Document.pdf`](file:///E:/CS5013/Project/CS5013_Phase3_Design_Document.pdf) and [`proposal.pdf`](file:///E:/CS5013/Project/proposal.pdf).

The web dashboard enables researchers and stakeholders to:
1. Ingest four independent sensor data streams (CSV format) in any order.
2. Interactively inspect each sensor stream on dedicated time-series plots preserving original recorded timestamps.
3. Explore cross-sensor relationships (physiological response vs. vehicle velocity and acceleration) using strict exact-timestamp pairing.
4. Visually correlate multi-modal streams across trip duration via a synchronized multi-panel stacked timeline.

---

## 2. Supported Sensor Streams & CSV Formats

Users can upload four independent CSV files:

| Sensor Stream | Measurement Unit | Required Columns | Recognized Aliases |
| :--- | :--- | :--- | :--- |
| **Smartwatch Heart Rate** | `BPM` | `timestamp`, `heart_rate` | `hr`, `heartrate`, `bpm`, `pulse` |
| **Chest ECG Monitor** | `BPM` | `timestamp`, `ecg_hr` | `heart_rate`, `ecg_bpm`, `hr`, `bpm` |
| **Vehicle Velocity** | `km/h` | `timestamp`, `velocity` | `speed`, `speed_kmh`, `vel` |
| **Vehicle Acceleration** | `m/s²` | `timestamp`, `acceleration` | `accel`, `acc`, `acceleration_ms2` |

### Timestamp Formats Supported
- **ISO-8601 strings:** `2026-10-11T14:30:00Z`, `2026-10-11T14:30:00.500+05:30`
- **Standard Date-Time strings:** `2026-10-11 14:30:00`, `2026/10/11 14:30:00.000`
- **Unix Epoch Milliseconds:** `1791729000000`
- **Unix Epoch Seconds:** `1791729000` or `1791729000.5`

Sample test fixtures are provided in the [`sample_data/`](file:///E:/CS5013/Project/sample_data/) directory.

---

## 3. Implemented Visualizations

### Section 2: Individual Sensor Visualizations
- **Heart Rate Comparison:** Plotted with distinctive colored series (Smartwatch: Ocean Cyan, Chest ECG: Crimson). Either series can be displayed independently if only one file is uploaded. Clearly labels independent hardware clocks.
- **Vehicle Velocity Over Time:** Interactive velocity profile in km/h with tooltip metrics and peak speed tracking.
- **Vehicle Acceleration Over Time:** Longitudinal acceleration and deceleration (m/s²) with zero-line baseline for braking events.

### Section 3: Cross-Sensor Relationships (Exploratory Views)
Strict adherence to Rule 3: Points are paired **only when timestamps match exactly** (`epochMillis == epochMillis`).
- **Heart Rate vs Vehicle Velocity:** Scatter plots for both Smartwatch HR and Chest ECG HR against ground speed.
- **Heart Rate vs Vehicle Acceleration:** Scatter plots exploring heart rate variation during throttle vs braking.
- **Phase Dynamics (Velocity vs Acceleration):** Scatter plot of vehicle speed against longitudinal acceleration.
- **Sensor Concordance:** Side-by-side scatter of Smartwatch HR vs Chest ECG HR, plus discrepancy timeline `(Smartwatch − Chest ECG)` over time.
- **Informative Empty States:** When streams have zero exact timestamp matches (e.g. `unmatched_velocity.csv`), displays: *"Insufficient exact timestamp matches to plot this relationship."*

### Section 4: Combined Motion and Heart Rate Timeline
- Vertically stacked multi-panel timeline (Heart Rate, Velocity, Acceleration) with synchronized crosshair cursor inspection.

---

## 4. Technology Stack & Architecture

- **Backend:** Java 17/26 with Apache Maven
  - Core HTTP Server: `com.sun.net.httpserver.HttpServer` (zero container bloat)
  - CSV Ingestion: `org.apache.commons:commons-csv:1.10.0`
  - JSON Serialization: `com.fasterxml.jackson.core:jackson-databind:2.17.0`
  - Automated Tests: JUnit 5 (`org.junit.jupiter:5.10.2`)
- **Frontend:**
  - Modern, responsive HTML5/CSS3 dashboard layout
  - Offline-bundled `Chart.js` 4.4.2 (runs locally without internet connection)
  - Drag-and-drop file uploaders with instant client & server validation

---

## 5. Local Startup Instructions

### Prerequisites
- Java JDK 17 or later installed.
- (Optional) Maven if installed, or use the included `./mvnw.cmd` wrapper.

### Step 1: Run Automated Tests
```powershell
.\mvnw.cmd test
```
All parser and exact-timestamp matcher unit tests will execute and report pass status.

### Step 2: Start the Web Application
```powershell
.\mvnw.cmd compile exec:java
```
Or with custom port:
```powershell
$env:PORT="8080"; .\mvnw.cmd compile exec:java
```

### Step 3: Open in Browser
Visit the dashboard in your web browser:
```
http://localhost:8080
```

---

## 6. Demonstration Walkthrough

1. Open `http://localhost:8080` in your web browser.
2. In **Section 1**, drag or browse `sample_data/smartwatch_heart_rate.csv`.
3. Observe **Section 2** instantly render the Smartwatch Heart Rate graph.
4. Upload `sample_data/chest_ecg_heart_rate.csv` and observe the dual-series comparison unlock.
5. Upload `sample_data/vehicle_velocity.csv` and `sample_data/vehicle_acceleration.csv`.
6. Inspect the Velocity and Acceleration graphs in Section 2.
7. Switch to **Section 3** to explore the scatter plots (HR vs Velocity, HR vs Acceleration, Velocity vs Acceleration, Sensor Agreement).
8. Scroll to **Section 4** to view the synchronized 3-panel trip timeline.
9. To test Rule 3 edge-case handling, upload `sample_data/unmatched_velocity.csv` and observe the notification *"Insufficient exact timestamp matches to plot this relationship (0 matches found)"*.
