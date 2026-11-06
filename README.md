# Multi-Modal Transportation Data Fusion & Visualization Platform
## High-Precision Sensor Stream Synchronization, Telemetry Analytics & Interactive Dashboard
### CS5013: Principles of Analytics and Intelligence &bull; Project Milestone

[![Java](https://img.shields.io/badge/Java-17%20LTS-blue.svg)](https://www.oracle.com/java/)
[![Maven](https://img.shields.io/badge/Apache%20Maven-3.9.9-red.svg)](https://maven.apache.org/)
[![Tests](https://img.shields.io/badge/JUnit%205-18%20Passed-brightgreen.svg)](https://junit.org/junit5/)
[![Documentation](https://img.shields.io/badge/Doxygen-1.12.0%20HTML5-informational.svg)](docs/html/index.html)
[![Status](https://img.shields.io/badge/Milestone-Feature%20Complete-success.svg)]()

---

## 1. Project Overview

The **Multi-Modal Transportation Data Fusion Platform** is a research-grade web dashboard and telemetry processing engine designed to ingest, validate, synchronize, and correlate heterogeneous real-world sensor streams collected during transportation and driving field experiments.

In complex transportation studies, data is acquired concurrently across disparate hardware systems operating on independent, non-synchronized hardware clocks:
* **Wearable Smartwatch Photoplethysmography (PPG):** Measures continuous peripheral pulse rate (BPM).
* **Chest-Strap Electrical Cardiac Electrodes (ECG):** High-fidelity cardiac monitoring (Polar H10 BLE stream).
* **Vehicle Telemetry & GNSS Dynamics:** High-frequency ground velocity (km/h) and longitudinal acceleration ($m/s^2$).
* **Electrodermal Activity / Galvanic Skin Response (GSR):** HealthyPi wearable recording skin conductance response to cognitive stress and braking events.

### Core Objectives & Design Guarantees
1. **Asynchronous Ingestion:** Allows researchers to upload sensor streams in any sequence without rigid dependency constraints.
2. **Strict Exact-Timestamp Pairing (Rule 3):** To eliminate synthetic artifacts in cross-sensor correlation, points are strictly paired **only when timestamps match exactly** (`epochMillis == epochMillis`). The platform explicitly rejects interpolation, nearest-neighbor estimation, or clock drift assumptions.
3. **Synchronized Stacked Inspection:** A multi-panel synchronized timeline crosshair allows visual inspection across all modalities across the trip duration.
4. **Automated Master Export:** Downstream machine learning workflows can export the synchronized master dataset or processed individual streams with standard ISO-8601 timestamps.

---

## 2. System Architecture

The project follows a clean separation of concerns, decoupling data parsing, pairing logic, REST communication, and frontend rendering:

```
+-----------------------------------------------------------------------------------+
|                                  WEB FRONTEND                                     |
|     HTML5 / CSS3 Responsive Dashboard  +  Chart.js 4.4.2 (Offline Bundled)       |
+-----------------------------------------------------------------------------------+
                                         │  HTTP / REST
                                         ▼
+-----------------------------------------------------------------------------------+
|                        JAVA HTTP BACKEND (DashboardServer)                        |
|  • ApiHandler (Routing, CORS, JSON/CSV streaming)                                 |
|  • StaticFileHandler (Zero-container embedded asset server)                       |
+-----------------------------------------------------------------------------------+
         │                                   │                           │
         ▼                                   ▼                           ▼
+---------------------+             +-------------------+       +-------------------+
|   CsvSensorParser   |             |   ExactMatcher    |       |   DataExporter    |
| • Timestamp normal. |             | • Hash-index join |       | • Master timeline |
| • Dialect detector  | ───Result──►| • O(N) alignment |       | • CSV/JSON format |
| • Robust validator  |             | • Zero resampling |       |                   |
+---------------------+             +-------------------+       +-------------------+
```

### Key Components
* **[`CsvSensorParser`](file:///src/main/java/edu/iitm/cs5013/parser/CsvSensorParser.java):** Multi-dialect CSV parser capable of parsing standard 2-column CSVs, raw Android GNSS Logger files (including embedded Polar HR), Samsung Watch multi-session files, and HealthyPi chunked GSR files.
* **[`ExactTimestampMatcher`](file:///src/main/java/edu/iitm/cs5013/matcher/ExactTimestampMatcher.java):** High-performance $O(N)$ hash-indexed exact matcher ensuring timestamp parity across independent streams.
* **[`DataExporter`](file:///src/main/java/edu/iitm/cs5013/export/DataExporter.java):** Compiles multi-sensor arrays into unified synchronized master CSV matrices.
* **[`ApiHandler`](file:///src/main/java/edu/iitm/cs5013/server/ApiHandler.java):** REST controller handling uploads, exploratory matching queries, and field data auto-loading.

---

## 3. Supported Sensor Streams & Formats

The ingestion engine automatically recognizes standard CSV headers as well as real-world device logs:

| Modality | Unit | Standard Headers | Supported Hardware Formats |
| :--- | :--- | :--- | :--- |
| **Smartwatch Heart Rate** | `BPM` | `timestamp, heart_rate` | Samsung Galaxy Watch export (`watch_timestamp_ms, hr_bpm`) |
| **Chest ECG Monitor** | `BPM` | `timestamp, ecg_hr` | Polar H10 BLE logged via GNSS Logger (`Date, Time_IST, Polar_HR_bpm`) |
| **Vehicle Velocity** | `km/h` | `timestamp, velocity` | GNSS Logger (`Speed_kph` / `Speed_mps`), unified vehicle dynamics |
| **Vehicle Acceleration** | $m/s^2$ | `timestamp, acceleration` | GNSS Logger (`Acceleration_mps2`), calculated numerical derivative |
| **HealthyPi Watch (GSR)** | Conductance | `timestamp_utc, ch0_detrended` | HealthyPi 32-Hz chunked logs (`hs_record_*_gsr.csv`) |

### Supported Timestamp Formats
* **ISO-8601 Strings:** `2026-10-22T16:41:32Z`, `2026-10-22T16:41:32.500+05:30`
* **Local Date-Time Strings:** `2026-10-22 16:41:32`, `2026/10/22 16:41:32.000`
* **Separated Date & Time:** `Date` + `Time_IST` (e.g. `2026-10-22`, `16:41:32`)
* **Unix Epoch Milliseconds:** `1729600000000`
* **Unix Epoch Seconds:** `1729600000` or floating-point seconds `1729600000.5`

---

## 4. Doxygen Technical Developer Documentation

To facilitate ongoing maintenance and development, the repository includes full **Doxygen** technical reference documentation.

### Browsing the Documentation
Open the pre-built interactive HTML documentation in your browser:
```
docs/html/index.html
```

### Generating / Updating Doxygen Documentation
Ensure you have Doxygen installed (or use the included wrapper):
```powershell
# Using the bundled wrapper
.\doxygen.cmd

# Or directly if doxygen is in your PATH
doxygen Doxyfile
```

### What the Generated Documentation Includes
* **Class Hierarchy & Inheritance Trees:** Detailed visual maps of all models, parsers, and controllers.
* **Method Signatures & Parameter Contracts:** Full Javadoc-extracted documentation for every method and constructor.
* **Cross-Reference Caller / Callee Graphs:** Visual and hyperlinked graphs illustrating dependencies between `ApiHandler`, `CsvSensorParser`, `ExactTimestampMatcher`, and `DataExporter`.
* **Source Code Browser:** Direct syntax-highlighted source code navigation.

---

## 5. REST API Specification

| Endpoint | Method | Description | Request / Query | Response |
| :--- | :--- | :--- | :--- | :--- |
| `/api/status` | `GET` | Health check and system runtime metadata | None | JSON with runtime version and data availability |
| `/api/upload` | `POST` | Ingest and validate sensor CSV stream | JSON `{ sensorType, filename, csvContent }` | `SensorParseResult` JSON |
| `/api/match` | `POST` | Execute strict exact-timestamp pairing | JSON `{ seriesX, seriesY, labelX, labelY }` | `MatchResult` JSON |
| `/api/oct22-data` | `GET` | Ingest local 22 Oct multi-sensor field dataset | None | JSON with all 5 parsed sensor series |
| `/api/samples` | `GET` | List available sample test fixtures | None | List of sample filenames and metadata |
| `/api/sample-data/{name}` | `GET` | Fetch content of a sample CSV fixture | Path parameter | Raw CSV text |
| `/api/export/master` | `POST` | Export synchronized master matrix | JSON `{ datasets: { ... } }` | Synchronized CSV download |
| `/api/export/sensor` | `POST` | Export processed sensor series | JSON `SensorParseResult` | Filtered CSV download |
| `/api/export/matched` | `POST` | Export exact-matched pair series with Pearson $r$ & OLS fit | JSON `MatchResult` or `{ seriesX, seriesY, labelX, labelY }` | Matched pair CSV download |
| `/api/export/agreement` | `POST` | Export dual-sensor agreement with Bland-Altman stats | JSON `MatchResult` or `{ seriesX, seriesY, labelX, labelY }` | Agreement CSV download |

---

## 6. Local Setup, Build & Running

### Prerequisites
* **Java JDK 17** or higher installed.
* **Apache Maven** (or use the provided portable Maven wrapper `mvnw.cmd`).
* Modern web browser (Chrome, Edge, Firefox, Safari).

### Step 1: Run Automated Test Suite
```powershell
.\mvnw.cmd test
```
All 20 automated unit tests covering parser validation, statistical moments (`meanValue`, `stdDevValue`, `skippedRowsCount`), multi-dialect timestamp normalization, exact matching correlation/Bland-Altman metrics, and data export formatting will execute.

### Step 2: Launch the Web Server
```powershell
.\mvnw.cmd compile exec:java
```
Or specify a custom listening port:
```powershell
$env:PORT="8080"; .\mvnw.cmd compile exec:java
```

### Step 3: Access Dashboard
Navigate to:
```
http://localhost:8080
```

---

## 7. Demonstration Walkthrough

### Option A: Real-World Multi-Modal Field Study Data (Recommended)
1. Open [http://localhost:8080](http://localhost:8080).
2. Click the **"Load Field Data"** button in the top navigation bar.
3. The platform will automatically load and synchronize:
   - **Samsung Galaxy Watch HR:** 4,900 photoplethysmography records.
   - **Polar H10 Chest ECG:** 6,214 electrical cardiac electrode records.
   - **Vehicle Ground Velocity:** 6,193 speed points up to 76.26 km/h.
   - **Vehicle Acceleration:** 6,192 longitudinal dynamics points (-10.45 to +7.16 $m/s^2$).
   - **HealthyPi Watch GSR:** 5,932 electrodermal conductance points.
4. Scroll to **Section 2** to inspect individual sensor streams.
5. Explore **Section 3** for exact-timestamp scatter plots (HR vs Velocity, HR vs Acceleration, Vehicle Phase Dynamics, Sensor Agreement).
6. Inspect **Section 4** for the 3-panel synchronized timeline crosshair.
7. Click **"Export Data"** to download the master synchronized dataset.

### Option B: Step-by-Step Manual Upload
1. Click **"Load Sample Data"** or drag-and-drop individual files from [`sample_data/`](file:///sample_data/):
   - `smartwatch_heart_rate.csv`
   - `chest_ecg_heart_rate.csv`
   - `vehicle_dynamics.csv`
2. Test Rule 3 edge case handling by uploading `sample_data/unmatched_velocity.csv` to observe graceful notification when zero exact timestamp matches exist.

---

## 8. Project Structure

```
Project/
├── pom.xml                               # Maven project definition and dependencies
├── Doxyfile                              # Doxygen configuration for technical documentation
├── doxygen.cmd                           # Doxygen execution wrapper script
├── mvnw.cmd                              # Maven wrapper script
├── README.md                             # Project documentation and developer guide
├── docs/                                 # Generated technical documentation
│   └── html/                             # Doxygen interactive HTML5 website (index.html)
├── sample_data/                          # Clean sample fixtures for automated testing & demo
│   ├── chest_ecg_heart_rate.csv
│   ├── smartwatch_heart_rate.csv
│   ├── vehicle_acceleration.csv
│   ├── vehicle_dynamics.csv
│   ├── vehicle_velocity.csv
│   └── unmatched_velocity.csv
└── src/
    ├── main/
    │   ├── java/edu/iitm/cs5013/
    │   │   ├── Main.java                 # Entry point and server initialization
    │   │   ├── export/
    │   │   │   └── DataExporter.java     # CSV / JSON export serialization
    │   │   ├── matcher/
    │   │   │   └── ExactTimestampMatcher.java # Exact timestamp hash-matcher (Rule 3)
    │   │   ├── model/
    │   │   │   ├── MatchResult.java      # Model for correlation match output
    │   │   │   ├── PairedDataPoint.java  # Exact timestamp pair tuple
    │   │   │   ├── SensorDataPoint.java  # Single timestamped telemetry reading
    │   │   │   ├── SensorParseResult.java# Complete parsed series model with stats
    │   │   │   └── SensorType.java       # Enum of supported sensor modalities
    │   │   ├── parser/
    │   │   │   └── CsvSensorParser.java  # Multi-dialect CSV parser and normalizer
    │   │   └── server/
    │   │       ├── ApiHandler.java       # REST controller for all /api routes
    │   │       ├── DashboardServer.java  # Embedded HttpServer manager
    │   │       └── StaticFileHandler.java# Static web asset handler
    │   └── resources/web/
    │       ├── app.js                    # Frontend state machine, charts, and interactivity
    │       ├── chart.umd.min.js          # Bundled Chart.js 4.4.2
    │       ├── index.html                # Responsive dashboard structure
    │       └── style.css                 # Custom modern dark/light telemetry theme
    └── test/
        └── java/edu/iitm/cs5013/
            ├── CsvSensorParserTest.java  # Comprehensive parser and matcher unit tests
            └── DataExporterTest.java     # Export serialization unit tests
```

---

## 9. Contributors & Academic Metadata

* **Institution:** Indian Institute of Technology Madras (IITM)
* **Course:** CS5013 - Principles of Analytics and Intelligence (PAI)
* **Team:** Team AA
* **Authors:**
  * Akshit Gupta (`CE23B054`)
  * Ayush Shukla (`CE23B057`)
