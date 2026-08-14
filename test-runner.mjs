import { fetchSchedule, fetchEntregues } from "./src/lib/sheets.functions.ts";

async function run() {
  try {
    console.log("Calling fetchSchedule...");
    const data = await (fetchSchedule as any)();
    console.log("fetchSchedule SUCCESS! Total rows:", data.rows.length);
    console.log("First row:", data.rows[0]);
    
    console.log("Calling fetchEntregues...");
    const history = await (fetchEntregues as any)();
    console.log("fetchEntregues SUCCESS! Total rows:", history.length);
  } catch (err) {
    console.error("Error calling functions:", err);
  }
}

run();
