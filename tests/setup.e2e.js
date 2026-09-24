import dotenv from "dotenv";
import "./utils/circular-json-handler.js";
// Explicit live-E2E configuration only. Unit tests never read this file.
dotenv.config({ path: "./tests/.env" });
