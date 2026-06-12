import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import logger from "./logger.js";
// Simulation State
let mockComments = [];
let mockIssue = {
    title: "Bug beim Login mit OAuth @dev-assist",
    description: "Wenn ich auf Login klicke passiert gar nichts. Bitte fixen.",
    author: { username: "nico03werner" }
};
// Helper to run a command and return stdout/stderr
function runCommand(command) {
    logger.info(`[GLAB] Executing: ${command}`);
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Command failed: ${command}\nError: ${error.message}\nStderr: ${stderr}`));
            }
            else {
                resolve(stdout.trim());
            }
        });
    });
}
// Helper to run a glab api command with a JSON payload file
async function runGlabWithPayload(endpoint, method, payload) {
    const tempFileName = `.tmp-glab-${Math.random().toString(36).substring(7)}.json`;
    const tempFilePath = path.join(process.cwd(), tempFileName);
    logger.info(`[GLAB] Creating temp payload file: ${tempFileName}`);
    try {
        fs.writeFileSync(tempFilePath, JSON.stringify(payload), "utf8");
        const cmd = `glab api -X ${method} "${endpoint}" -H "Content-Type: application/json" --input "${tempFilePath}"`;
        return await runCommand(cmd);
    }
    finally {
        try {
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
        }
        catch (err) {
            logger.error(`Failed to clean up temp file ${tempFilePath}: ` + err.message);
        }
    }
}
/**
 * Gets the username of the currently logged-in GitLab user.
 */
export async function getGitlabUser() {
    if (process.env.IS_SIMULATION === "true") {
        return "dev-assist-bot";
    }
    try {
        const output = await runCommand("glab api user");
        const user = JSON.parse(output);
        return user.username;
    }
    catch (error) {
        logger.error("Error fetching GitLab user: " + error.message);
        throw error;
    }
}
/**
 * Fetches issue details.
 */
export async function getIssue(projectId, issueIid) {
    if (process.env.IS_SIMULATION === "true") {
        return mockIssue;
    }
    const endpoint = `projects/${encodeURIComponent(projectId)}/issues/${issueIid}`;
    try {
        const output = await runCommand(`glab api "${endpoint}"`);
        return JSON.parse(output);
    }
    catch (error) {
        logger.error(`Error fetching issue ${issueIid} from project ${projectId}: ` + error.message);
        throw error;
    }
}
/**
 * Fetches all comments (notes) for a specific issue.
 */
export async function getIssueComments(projectId, issueIid) {
    if (process.env.IS_SIMULATION === "true") {
        return mockComments;
    }
    const endpoint = `projects/${encodeURIComponent(projectId)}/issues/${issueIid}/notes`;
    try {
        const output = await runCommand(`glab api "${endpoint}" --paginate`);
        try {
            return JSON.parse(output);
        }
        catch {
            return output.split("\n").filter(line => line.trim()).map(line => JSON.parse(line)).flat();
        }
    }
    catch (error) {
        logger.error(`Error fetching comments for issue ${issueIid}: ` + error.message);
        return [];
    }
}
/**
 * Adds a new comment (note) to a specific issue.
 */
export async function postIssueComment(projectId, issueIid, body) {
    if (process.env.IS_SIMULATION === "true") {
        const newComment = {
            id: Math.floor(Math.random() * 10000),
            body,
            author: { username: "dev-assist-bot" }
        };
        mockComments.push(newComment);
        logger.info(`[GLAB SIMULATION] Bot Posted Comment: \n${body}`);
        return newComment;
    }
    const endpoint = `projects/${encodeURIComponent(projectId)}/issues/${issueIid}/notes`;
    try {
        const output = await runGlabWithPayload(endpoint, 'POST', { body });
        return JSON.parse(output);
    }
    catch (error) {
        logger.error(`Error posting comment to issue ${issueIid}: ` + error.message);
        throw error;
    }
}
/**
 * Updates an issue's title and description.
 */
export async function updateIssue(projectId, issueIid, title, description) {
    if (process.env.IS_SIMULATION === "true") {
        mockIssue.title = title;
        mockIssue.description = description;
        logger.info(`[GLAB SIMULATION] Issue Updated:\nTitle: ${title}\nDescription:\n${description}`);
        return mockIssue;
    }
    const endpoint = `projects/${encodeURIComponent(projectId)}/issues/${issueIid}`;
    try {
        const output = await runGlabWithPayload(endpoint, 'PUT', { title, description });
        return JSON.parse(output);
    }
    catch (error) {
        logger.error(`Error updating issue ${issueIid}: ` + error.message);
        throw error;
    }
}
/**
 * Deletes a comment (note) from an issue.
 */
export async function deleteIssueComment(projectId, issueIid, noteId) {
    if (process.env.IS_SIMULATION === "true") {
        logger.info(`[GLAB SIMULATION] Deleted comment #${noteId}`);
        mockComments = mockComments.filter(c => c.id !== noteId);
        return;
    }
    const endpoint = `projects/${encodeURIComponent(projectId)}/issues/${issueIid}/notes/${noteId}`;
    try {
        await runCommand(`glab api -X DELETE "${endpoint}"`);
    }
    catch (error) {
        logger.error(`Failed to delete comment ${noteId} on issue ${issueIid}: ` + error.message);
    }
}
