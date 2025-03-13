import { OpenAI } from "openai";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const LOGS_DIRECTORY = "./logs"; 
// Change to your actual logs folder loaction for now where retina gets default downloaded

// Function to read all log and cap files
async function readLogFiles(directory: string): Promise<string[]> {
    const files = fs.readdirSync(directory);
    const logs: string[] = [];

    for (const file of files) {
        const filePath = path.join(directory, file);
        if (file.endsWith(".log") || file.endsWith(".cap")) {
            const content = fs.readFileSync(filePath, "utf8");
            logs.push(`File: ${file}\n${content}\n\n`);
        }
    }

    return logs;
}

// Function to send logs to OpenAI for analysis
export async function analyzeLogs() {
    const logs = await readLogFiles(LOGS_DIRECTORY);
    if (logs.length === 0) {
        console.log("No log files found.");
        return;
    }

    const prompt = `Analyze the following log files for any errors or anomalies:\n\n${logs.join("\n")}\n\nProvide a summary of issues found and possible solutions.`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.5,
        });

        console.log("Analysis Result:");
        console.log(response.choices[0].message.content);
    } catch (error) {
        console.error("Error analyzing logs:", error);
    }
}

analyzeLogs();
