🩺 FitDays BLE BIA Analyzer

FitDays BLE BIA Analyzer is a reverse-engineered web-based platform designed to decode, analyze, and visualize Body Impedance Analysis (BIA) and weight data transmitted by the FitDays Smart Scale via Bluetooth Low Energy (BLE).

🚀 Project Overview

This project was developed as a client research and data extraction tool, aimed at understanding the data flow, communication protocol, and underlying algorithms of the FitDays Smart Scale application.

The process involved:

Decompiling the official FitDays Android APK using jadx to analyze internal logic and data transformation algorithms.

Capturing BLE communication packets (.pcapng) between the smart scale and mobile app to extract UUIDs, services, and characteristic mappings.

Reconstructing core algorithms to interpret body composition data (BIA, weight, fat %, etc.) from raw BLE payloads.

Developing a web-based BLE analyzer to connect to compatible devices and visualize parsed data in real-time.

🧠 Key Features

🔍 BLE Packet Sniffer Integration: Reads and interprets real-time BLE advertising and GATT data.

🧩 UUID Mapping Engine: Maps vendor-specific FitDays services and characteristics to human-readable data.

⚙️ Algorithm Extraction: Reconstructed logic from decompiled APK for computing BIA metrics.

📊 Web-Based Analyzer UI: Interactive dashboard for connecting to a FitDays-compatible BLE device and visualizing metrics like:

Weight

Fat %

Muscle Mass

BMI

Water %

Bone Density

![FitDays BLE Analyzer UI](https://github.com/ahmedammad1709/FitDays-BLE-BIA-Analyzer/blob/main/captures/UI.PNG?raw=true)


🧱 Tech Stack

Frontend: HTML, CSS, JavaScript, Web Bluetooth API

Analysis Tools: Wireshark, Jadx, BLE Sniffer

File Artifacts: .apk, .pcapng, .json, .txt (UUIDs, raw data, logs)

Platform: Web-based for direct browser BLE access

📂 Repository Structure
FitDays-BLE-BIA-Analyzer/
│
├── analysis/                # Decompiled code snippets, UUIDs, BLE mapping <br/>
├── web-app/                 # Web Bluetooth implementation <br/>
├── captures/                # BLE traffic (.pcapng) and test data <br/>
├── logs/                    # Connection and debug logs <br/>
├── docs/                    # Notes on reverse-engineered algorithms <br/>
└── README.md                # Project documentation (you’re reading it!) <br/>

⚠️ Legal & Ethical Disclaimer

This project was developed strictly for educational and client research purposes to study BLE communication patterns and data decoding logic.
No proprietary assets or copyrighted content from the original FitDays app are distributed or reused.
Use responsibly and in accordance with applicable reverse-engineering and data privacy laws.

👨‍💻 Author

Ammad Ahmed
💼 Software Developer | BLE & Web Engineer <br/>
📧 ahmedammad2006@gmail.com <br/>
🌐 ammadahmed.netlify.app