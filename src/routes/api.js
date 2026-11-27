const express = require("express");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { stringify } = require("csv-stringify/sync");
const PDFDocument = require("pdfkit");
const pool = require("../db");

const router = express.Router();
const scrypt = promisify(crypto.scrypt);
const WORK_MODES = ["On-site", "Hybrid", "Remote"];
const VIEW_QUERIES = {
	v_application_details:
		"SELECT * FROM v_application_details ORDER BY application_id",
	v_application_status_summary:
		"SELECT * FROM v_application_status_summary ORDER BY status_name",
	v_application_status_history_audit:
		"SELECT * FROM v_application_status_history_audit ORDER BY history_id",
	v_employer_activity_full_summary:
		"SELECT * FROM v_employer_activity_full_summary ORDER BY employer_id",
	v_posting_application_counts:
		"SELECT * FROM v_posting_application_counts ORDER BY posting_id",
	v_open_internship_postings:
		"SELECT * FROM v_open_internship_postings ORDER BY deadline",
	v_interview_schedule:
		"SELECT * FROM v_interview_schedule ORDER BY scheduled_at",
	v_recruiter_posting_workload:
		"SELECT * FROM v_recruiter_posting_workload ORDER BY recruiter_id",
	v_employer_salary_summary:
		"SELECT * FROM v_employer_salary_summary ORDER BY employer_id",
	v_student_application_counts:
		"SELECT * FROM v_student_application_counts ORDER BY student_id",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(res, status, error, details) {
	return res.status(status).json({ error, ...(details ? { details } : {}) });
}
function positiveId(value) {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
function validDateOnly(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return (
		!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
	);
}
function text(value, max, required = false) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (required && !trimmed) return null;
	return trimmed.length <= max ? trimmed : null;
}
function validatePosting(body) {
	const errors = [];
	const title = text(body.title, 150, true);
	const description = text(body.description, 5000, true);
	const location = text(body.location, 120, true);
	const workMode = text(body.workMode, 20, true);
	const deadline = text(body.deadline, 10, true);
	const externalUrl =
		body.externalUrl == null || body.externalUrl === ""
			? null
			: text(body.externalUrl, 500);
	const employerId = positiveId(body.employerId);
	const recruiterId =
		body.recruiterId == null || body.recruiterId === ""
			? null
			: positiveId(body.recruiterId);
	const salary = (value) =>
		value == null || value === ""
			? null
			: Number.isFinite(Number(value)) && Number(value) >= 0
				? Number(value)
				: NaN;
	const minSalary = salary(body.minSalary);
	const maxSalary = salary(body.maxSalary);
	if (!title) errors.push("Title is required (maximum 150 characters).");
	if (!description)
		errors.push("Description is required (maximum 5000 characters).");
	if (!location) errors.push("Location is required (maximum 120 characters).");
	if (!WORK_MODES.includes(workMode))
		errors.push("Work mode must be On-site, Hybrid, or Remote.");
	if (!validDateOnly(deadline))
		errors.push("Deadline must be a valid YYYY-MM-DD date.");
	if (!employerId) errors.push("A valid employer ID is required.");
	if (Number.isNaN(minSalary) || Number.isNaN(maxSalary))
		errors.push("Salary values must be non-negative numbers.");
	if (minSalary != null && maxSalary != null && minSalary > maxSalary)
		errors.push("Minimum salary cannot exceed maximum salary.");
	if (body.recruiterId != null && body.recruiterId !== "" && !recruiterId)
		errors.push("Recruiter ID must be a positive integer.");
	if (body.externalUrl && (!externalUrl || !/^https?:\/\//i.test(externalUrl)))
		errors.push("External URL must start with http:// or https://.");
	return {
		errors,
		values: {
			title,
			description,
			location,
			workMode,
			deadline,
			externalUrl,
			employerId,
			recruiterId,
			minSalary,
			maxSalary,
		},
	};
}
function asyncRoute(handler) {
	return (req, res, next) =>
		Promise.resolve(handler(req, res, next)).catch(next);
}
function requireAuth(req, res, next) {
	if (!req.session.user) return fail(res, 401, "Sign in to use this feature.");
	next();
}
function requireRoles(...roles) {
	return (req, res, next) => {
		if (!req.session.user)
			return fail(res, 401, "Sign in to use this feature.");
		if (!roles.includes(req.session.user.role))
			return fail(res, 403, "Your account role cannot perform this action.");
		next();
	};
}
function databaseError(res, error, context) {
	console.error(`${context}:`, error.message);
	if (error.code === "23505")
		return fail(res, 409, "A record with those unique values already exists.");
	if (error.code === "23503")
		return fail(
			res,
			409,
			"The record references data that does not exist or is still in use.",
		);
	if (error.code === "23514" || error.code === "22P02")
		return fail(
			res,
			400,
			"One or more values do not match the database rules.",
		);
	return fail(
		res,
		503,
		"The database could not complete the request. Check the database connection and schema.",
	);
}
async function validatePassword(password) {
	const salt = crypto.randomBytes(16).toString("hex");
	const hash = await scrypt(password, salt, 64);
	return `scrypt$${salt}$${hash.toString("hex")}`;
}
async function checkPassword(password, stored) {
	const [scheme, salt, hash] = String(stored || "").split("$");
	if (scheme !== "scrypt" || !salt || !hash || !/^[a-f0-9]{128}$/i.test(hash))
		return false;
	const actual = await scrypt(password, salt, 64);
	return crypto.timingSafeEqual(actual, Buffer.from(hash, "hex"));
}

router.get(
	"/health",
	asyncRoute(async (_req, res) => {
		try {
			const result = await pool.query(
				"SELECT current_database() AS database, NOW() AS checked_at",
			);
			res.json({
				status: "ok",
				database: result.rows[0].database,
				checkedAt: result.rows[0].checked_at,
			});
		} catch (error) {
			console.error("Health check failed:", error.message);
			fail(res, 503, "Database is unavailable. Check the connection settings.");
		}
	}),
);

router.get("/auth/me", (req, res) => {
	res.json({
		user: req.session.user || null,
		role: req.session.user?.role || "GUEST",
	});
});

router.post(
	"/auth/register",
	asyncRoute(async (req, res) => {
		const email = text(req.body.email, 255, true)?.toLowerCase();
		const password = req.body.password;
		const firstName = text(req.body.firstName, 60, true);
		const lastName = text(req.body.lastName, 60, true);
		const program = text(req.body.program, 120, true);
		const gradYear = Number(req.body.expectedGradYear);
		const errors = [];
		if (!email || !EMAIL_RE.test(email))
			errors.push("Enter a valid email address.");
		if (
			typeof password !== "string" ||
			password.length < 10 ||
			password.length > 200
		)
			errors.push("Password must be 10–200 characters.");
		if (!firstName)
			errors.push("First name is required (maximum 60 characters).");
		if (!lastName)
			errors.push("Last name is required (maximum 60 characters).");
		if (!program) errors.push("Program is required (maximum 120 characters).");
		if (!Number.isInteger(gradYear) || gradYear < 2026 || gradYear > 2035)
			errors.push("Expected graduation year must be from 2026 to 2035.");
		if (errors.length)
			return fail(res, 400, "Please correct the registration fields.", errors);
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			const result = await client.query(
				"INSERT INTO app_user (email, password_hash, user_role) VALUES ($1, $2, 'STUDENT') RETURNING user_id, email, user_role",
				[email, await validatePassword(password)],
			);
			const user = result.rows[0];
			await client.query(
				"INSERT INTO student (student_id, first_name, last_name, program, expected_grad_year) VALUES ($1, $2, $3, $4, $5)",
				[user.user_id, firstName, lastName, program, gradYear],
			);
			await client.query("COMMIT");
			req.session.regenerate((sessionError) => {
				if (sessionError)
					return fail(
						res,
						500,
						"Account created, but sign-in failed. Please log in.",
					);
				req.session.user = {
					id: user.user_id,
					email: user.email,
					role: user.user_role,
				};
				req.session.save((saveError) =>
					saveError
						? fail(
								res,
								500,
								"Account created, but sign-in failed. Please log in.",
							)
						: res.status(201).json({ user: req.session.user }),
				);
			});
		} catch (error) {
			await client.query("ROLLBACK");
			if (error.code === "23505")
				return fail(res, 409, "An account with that email already exists.");
			return databaseError(res, error, "Registration failed");
		} finally {
			client.release();
		}
	}),
);

router.post(
	"/auth/login",
	asyncRoute(async (req, res) => {
		const email = text(req.body.email, 255, true)?.toLowerCase();
		const password = req.body.password;
		if (
			!email ||
			!EMAIL_RE.test(email) ||
			typeof password !== "string" ||
			!password ||
			password.length > 200
		)
			return fail(res, 400, "Enter a valid email and password.");
		const result = await pool.query(
			"SELECT user_id, email, password_hash, user_role FROM app_user WHERE lower(email) = $1",
			[email],
		);
		const account = result.rows[0];
		if (!account || !(await checkPassword(password, account.password_hash)))
			return fail(
				res,
				401,
				"Email or password is incorrect. Existing Phase II demo password strings are not login passwords; register a new student account or create an administrator using the setup script.",
			);
		req.session.regenerate((error) => {
			if (error) return fail(res, 500, "Could not start a secure session.");
			req.session.user = {
				id: account.user_id,
				email: account.email,
				role: account.user_role,
			};
			req.session.save((saveError) =>
				saveError
					? fail(res, 500, "Could not save the login session.")
					: res.json({ user: req.session.user }),
			);
		});
	}),
);

router.post("/auth/logout", (req, res) => {
	req.session.destroy((error) => {
		if (error) return fail(res, 500, "Could not end the session.");
		res.clearCookie("internship.sid", { httpOnly: true, sameSite: "lax" });
		res.json({ message: "Signed out." });
	});
});

router.get("/views", (_req, res) =>
	res.json({ views: Object.keys(VIEW_QUERIES) }),
);
async function executeView(name) {
	const sql = VIEW_QUERIES[name];
	if (!sql) return null;
	return pool.query(sql);
}
router.get(
	"/views/:name.csv",
	requireRoles("ADMIN", "RECRUITER"),
	asyncRoute(async (req, res) => {
		const viewName = req.params.name;
		const result = await executeView(viewName);
		if (!result) return fail(res, 404, "Unknown report view.");
		const csv = stringify(result.rows, {
			header: true,
			columns: result.fields.map((field) => field.name),
		});
		res.type("text/csv").attachment(`${viewName}.csv`).send(csv);
	}),
);
router.get(
	"/views/:name.pdf",
	requireRoles("ADMIN", "RECRUITER"),
	asyncRoute(async (req, res) => {
		const result = await executeView(req.params.name);
		if (!result) return fail(res, 404, "Unknown report view.");
		res
			.status(200)
			.type("application/pdf")
			.attachment(`${req.params.name}.pdf`);
		const pdf = new PDFDocument({
			size: "LETTER",
			layout: "landscape",
			margin: 36,
		});
		pdf.pipe(res);
		pdf
			.fontSize(16)
			.text(`Internship Recruitment Report: ${req.params.name}`, {
				align: "left",
			});
		pdf
			.moveDown(0.5)
			.fontSize(8)
			.fillColor("#555")
			.text(`Generated ${new Date().toISOString()} | ${result.rowCount} rows`);
		pdf.moveDown();
		const columns = result.fields.map((field) => field.name);
		const usableWidth = 720;
		const colWidth = usableWidth / Math.max(columns.length, 1);
		const drawHeader = () => {
			pdf.font("Helvetica-Bold").fontSize(7).fillColor("#153b5c");
			const headerY = pdf.y;
			columns.forEach((column, index) =>
				pdf.text(column, 36 + index * colWidth, headerY, {
					width: colWidth - 5,
					height: 22,
					ellipsis: true,
				}),
			);
			pdf.moveDown(1.4).font("Helvetica").fillColor("#222");
		};
		drawHeader();
		for (const row of result.rows) {
			if (pdf.y > 525) {
				pdf.addPage();
				drawHeader();
			}
			const y = pdf.y;
			columns.forEach((column, index) => {
				let value = row[column];
				if (value instanceof Date) value = value.toISOString();
				pdf.fontSize(6.5).text(
					value == null
						? ""
						: String(value)
								.replace(/[\r\n]+/g, " ")
								.slice(0, 110),
					36 + index * colWidth,
					y,
					{ width: colWidth - 5, height: 28, ellipsis: true },
				);
			});
			pdf.moveDown(1.5);
		}
		pdf.end();
	}),
);
router.get(
	"/views/:name",
	requireRoles("ADMIN", "RECRUITER"),
	asyncRoute(async (req, res) => {
		const result = await executeView(req.params.name);
		if (!result) return fail(res, 404, "Unknown report view.");
		res.json({
			view: req.params.name,
			columns: result.fields.map((field) => field.name),
			rows: result.rows,
		});
	}),
);

router.get(
	"/postings",
	asyncRoute(async (req, res) => {
		const rawQ = req.query.q == null ? "" : req.query.q;
		const rawWorkMode = req.query.workMode == null ? "" : req.query.workMode;
		if (typeof rawQ !== "string" || rawQ.length > 100)
			return fail(res, 400, "Search text must be 100 characters or fewer.");
		if (typeof rawWorkMode !== "string" || rawWorkMode.length > 20)
			return fail(res, 400, "Work mode filter is invalid.");
		const q = rawQ.trim();
		const workMode = rawWorkMode.trim();
		if (workMode && !WORK_MODES.includes(workMode))
			return fail(res, 400, "Work mode must be On-site, Hybrid, or Remote.");
		const result = await pool.query(
			`SELECT p.posting_id,p.title,p.description,e.company_name,p.location,p.work_mode,
            p.min_salary,p.max_salary,p.deadline,u.email AS recruiter_email,p.external_url
     FROM internship_posting p
     JOIN employer e ON e.employer_id=p.employer_id
     JOIN recruiter r ON r.recruiter_id=p.recruiter_id
     JOIN app_user u ON u.user_id=r.recruiter_id
     WHERE p.posting_status='Open'
       AND ($1 = '' OR p.title ILIKE '%' || $1 || '%' OR e.company_name ILIKE '%' || $1 || '%'
            OR p.location ILIKE '%' || $1 || '%')
       AND ($2 = '' OR p.work_mode = $2)
     ORDER BY p.deadline`,
			[q, workMode],
		);
		res.json({ rows: result.rows, count: result.rowCount });
	}),
);
router.get(
	"/postings/:postingId/edit-data",
	requireRoles("ADMIN", "RECRUITER"),
	asyncRoute(async (req, res) => {
		const id = positiveId(req.params.postingId);
		if (!id) return fail(res, 400, "Posting ID must be a positive integer.");
		const result = await pool.query(
			`SELECT p.posting_id,p.employer_id,p.recruiter_id,p.title,p.description,p.location,p.work_mode,
            p.min_salary,p.max_salary,p.deadline,p.external_url,p.posting_status
     FROM internship_posting p WHERE p.posting_id=$1`,
			[id],
		);
		if (!result.rowCount) return fail(res, 404, "Posting not found.");
		if (
			req.session.user.role === "RECRUITER" &&
			Number(result.rows[0].recruiter_id) !== req.session.user.id
		)
			return fail(res, 403, "Recruiters can edit only their own postings.");
		res.json({ posting: result.rows[0] });
	}),
);
router.get(
	"/postings/:postingId",
	asyncRoute(async (req, res) => {
		const id = positiveId(req.params.postingId);
		if (!id) return fail(res, 400, "Posting ID must be a positive integer.");
		const result = await pool.query(
			"SELECT * FROM v_open_internship_postings WHERE posting_id = $1",
			[id],
		);
		if (!result.rowCount) return fail(res, 404, "Open posting not found.");
		res.json({ posting: result.rows[0] });
	}),
);

router.post(
	"/postings",
	requireRoles("ADMIN", "RECRUITER"),
	asyncRoute(async (req, res) => {
		const { errors, values } = validatePosting(req.body);
		if (errors.length)
			return fail(res, 400, "Please correct the posting fields.", errors);
		const recruiterId =
			req.session.user.role === "RECRUITER"
				? req.session.user.id
				: values.recruiterId;
		if (!recruiterId)
			return fail(
				res,
				400,
				"Administrator must supply a recruiter ID for the posting.",
			);
		if (req.session.user.role === "RECRUITER") {
			const owner = await pool.query(
				"SELECT employer_id FROM recruiter WHERE recruiter_id = $1",
				[recruiterId],
			);
			if (
				!owner.rowCount ||
				Number(owner.rows[0].employer_id) !== values.employerId
			)
				return fail(
					res,
					403,
					"Recruiters can post only for their own employer.",
				);
		}
		const result = await pool.query(
			`INSERT INTO internship_posting (employer_id, recruiter_id, title, description, location, work_mode, min_salary, max_salary, deadline, external_url, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Manual') RETURNING posting_id, title, posting_status`,
			[
				values.employerId,
				recruiterId,
				values.title,
				values.description,
				values.location,
				values.workMode,
				values.minSalary,
				values.maxSalary,
				values.deadline,
				values.externalUrl,
			],
		);
		res.status(201).json({ posting: result.rows[0] });
	}),
);
router.put(
	"/postings/:postingId",
	requireRoles("ADMIN", "RECRUITER"),
	asyncRoute(async (req, res) => {
		const id = positiveId(req.params.postingId);
		if (!id) return fail(res, 400, "Posting ID must be a positive integer.");
		const { errors, values } = validatePosting(req.body);
		if (errors.length)
			return fail(res, 400, "Please correct the posting fields.", errors);
		const existing = await pool.query(
			"SELECT recruiter_id, employer_id FROM internship_posting WHERE posting_id = $1",
			[id],
		);
		if (!existing.rowCount) return fail(res, 404, "Posting not found.");
		if (
			req.session.user.role === "RECRUITER" &&
			Number(existing.rows[0].recruiter_id) !== req.session.user.id
		)
			return fail(res, 403, "Recruiters can edit only their own postings.");
		const recruiterId =
			req.session.user.role === "RECRUITER"
				? req.session.user.id
				: values.recruiterId || Number(existing.rows[0].recruiter_id);
		const result = await pool.query(
			`UPDATE internship_posting SET employer_id=$1,recruiter_id=$2,title=$3,description=$4,location=$5,work_mode=$6,min_salary=$7,max_salary=$8,deadline=$9,external_url=$10
     WHERE posting_id=$11 RETURNING posting_id,title,posting_status`,
			[
				values.employerId,
				recruiterId,
				values.title,
				values.description,
				values.location,
				values.workMode,
				values.minSalary,
				values.maxSalary,
				values.deadline,
				values.externalUrl,
				id,
			],
		);
		res.json({ posting: result.rows[0] });
	}),
);
router.delete(
	"/postings/:postingId",
	requireRoles("ADMIN", "RECRUITER"),
	asyncRoute(async (req, res) => {
		const id = positiveId(req.params.postingId);
		if (!id) return fail(res, 400, "Posting ID must be a positive integer.");
		const found = await pool.query(
			"SELECT recruiter_id FROM internship_posting WHERE posting_id = $1 FOR UPDATE",
			[id],
		);
		if (!found.rowCount) return fail(res, 404, "Posting not found.");
		if (
			req.session.user.role === "RECRUITER" &&
			Number(found.rows[0].recruiter_id) !== req.session.user.id
		)
			return fail(res, 403, "Recruiters can delete only their own postings.");
		const applications = await pool.query(
			"SELECT COUNT(*)::int AS count FROM application WHERE posting_id=$1",
			[id],
		);
		if (applications.rows[0].count)
			return fail(
				res,
				409,
				"This posting has applications and cannot be deleted.",
			);
		const removed = await pool.query(
			"DELETE FROM internship_posting WHERE posting_id=$1 AND NOT EXISTS (SELECT 1 FROM application WHERE posting_id=$1) RETURNING posting_id",
			[id],
		);
		if (!removed.rowCount)
			return fail(
				res,
				409,
				"A student applied while this posting was being deleted. The posting was kept.",
			);
		res.json({ message: "Posting deleted." });
	}),
);

router.get(
	"/applications",
	requireAuth,
	asyncRoute(async (req, res) => {
		const user = req.session.user;
		let sql = `SELECT a.application_id,a.student_id,s.first_name,s.last_name,p.title AS internship_title,e.company_name,
                    st.status_name,a.applied_at,a.resume_link
             FROM application a JOIN student s ON s.student_id=a.student_id
             JOIN internship_posting p ON p.posting_id=a.posting_id
             JOIN employer e ON e.employer_id=p.employer_id
             JOIN application_status st ON st.status_id=a.status_id`;
		let params = [];
		if (user.role === "STUDENT") {
			sql += " WHERE a.student_id=$1";
			params = [user.id];
		} else if (user.role === "RECRUITER") {
			sql += " WHERE p.recruiter_id=$1";
			params = [user.id];
		}
		sql += " ORDER BY a.applied_at DESC";
		const result = await pool.query(sql, params);
		res.json({ rows: result.rows });
	}),
);
router.post(
	"/applications",
	requireRoles("STUDENT"),
	asyncRoute(async (req, res) => {
		const postingId = positiveId(req.body.postingId);
		const resumeLink =
			req.body.resumeLink == null || req.body.resumeLink === ""
				? null
				: text(req.body.resumeLink, 500);
		if (!postingId)
			return fail(res, 400, "Posting ID must be a positive integer.");
		if (
			req.body.resumeLink &&
			(!resumeLink || !/^https?:\/\//i.test(resumeLink))
		)
			return fail(
				res,
				400,
				"Resume link must be a valid http:// or https:// URL.",
			);
		const status = await pool.query(
			"SELECT status_id FROM application_status WHERE status_name='Submitted'",
		);
		if (!status.rowCount)
			return fail(
				res,
				503,
				"The Submitted application status is missing from the database.",
			);
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			const inserted = await client.query(
				"INSERT INTO application (student_id,posting_id,status_id,resume_link) SELECT $1,$2,$3,$4 WHERE EXISTS (SELECT 1 FROM internship_posting WHERE posting_id=$2 AND posting_status='Open') RETURNING application_id",
				[req.session.user.id, postingId, status.rows[0].status_id, resumeLink],
			);
			if (!inserted.rowCount) {
				await client.query("ROLLBACK");
				return fail(res, 404, "Open posting not found.");
			}
			await client.query(
				"INSERT INTO application_status_history (application_id,status_id,changed_by_user_id,note) VALUES ($1,$2,$3,$4)",
				[
					inserted.rows[0].application_id,
					status.rows[0].status_id,
					req.session.user.id,
					"Application submitted.",
				],
			);
			await client.query("COMMIT");
			res
				.status(201)
				.json({
					applicationId: inserted.rows[0].application_id,
					message: "Application submitted.",
				});
		} catch (error) {
			await client.query("ROLLBACK");
			if (error.code === "23505")
				return fail(res, 409, "You have already applied to this posting.");
			return databaseError(res, error, "Application creation failed");
		} finally {
			client.release();
		}
	}),
);
router.put(
	"/applications/:applicationId",
	requireAuth,
	asyncRoute(async (req, res) => {
		const id = positiveId(req.params.applicationId);
		if (!id)
			return fail(res, 400, "Application ID must be a positive integer.");
		const user = req.session.user;
		const app = await pool.query(
			"SELECT a.student_id,a.status_id,p.recruiter_id FROM application a JOIN internship_posting p ON p.posting_id=a.posting_id WHERE a.application_id=$1",
			[id],
		);
		if (!app.rowCount) return fail(res, 404, "Application not found.");
		const isStudent =
			user.role === "STUDENT" && Number(app.rows[0].student_id) === user.id;
		const isStaff =
			user.role === "ADMIN" ||
			(user.role === "RECRUITER" &&
				Number(app.rows[0].recruiter_id) === user.id);
		if (!isStudent && !isStaff)
			return fail(res, 403, "You cannot edit this application.");
		let studentResumeLink;
		let staffStatusId;
		let staffNote;
		if (isStudent) {
			if (req.body.resumeLink === undefined)
				return fail(res, 400, "Provide resumeLink to update your application.");
			studentResumeLink =
				req.body.resumeLink === "" || req.body.resumeLink == null
					? null
					: text(req.body.resumeLink, 500);
			if (
				req.body.resumeLink &&
				(!studentResumeLink || !/^https?:\/\//i.test(studentResumeLink))
			)
				return fail(
					res,
					400,
					"Resume link must be a valid http:// or https:// URL.",
				);
		} else {
			staffStatusId = positiveId(req.body.statusId);
			staffNote = text(req.body.note || "", 500) || null;
			if (!staffStatusId)
				return fail(res, 400, "A valid statusId is required.");
			const validStatus = await pool.query(
				"SELECT status_id FROM application_status WHERE status_id=$1",
				[staffStatusId],
			);
			if (!validStatus.rowCount)
				return fail(res, 400, "Status ID does not exist.");
		}
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			let result;
			if (isStudent) {
				result = await client.query(
					"UPDATE application SET resume_link=$1 WHERE application_id=$2 RETURNING application_id,status_id,resume_link",
					[studentResumeLink, id],
				);
			} else {
				result = await client.query(
					"UPDATE application SET status_id=$1 WHERE application_id=$2 RETURNING application_id,status_id,resume_link",
					[staffStatusId, id],
				);
				await client.query(
					"INSERT INTO application_status_history (application_id,status_id,changed_by_user_id,note) VALUES ($1,$2,$3,$4)",
					[id, staffStatusId, user.id, staffNote],
				);
			}
			await client.query("COMMIT");
			res.json({ application: result.rows[0] });
		} catch (error) {
			await client.query("ROLLBACK");
			return databaseError(res, error, "Application update failed");
		} finally {
			client.release();
		}
	}),
);
router.delete(
	"/applications/:applicationId",
	requireAuth,
	asyncRoute(async (req, res) => {
		const id = positiveId(req.params.applicationId);
		if (!id)
			return fail(res, 400, "Application ID must be a positive integer.");
		const result = await pool.query(
			"SELECT a.student_id,p.recruiter_id FROM application a JOIN internship_posting p ON p.posting_id=a.posting_id WHERE a.application_id=$1",
			[id],
		);
		if (!result.rowCount) return fail(res, 404, "Application not found.");
		const user = req.session.user;
		const allowed =
			user.role === "ADMIN" ||
			(user.role === "STUDENT" &&
				Number(result.rows[0].student_id) === user.id) ||
			(user.role === "RECRUITER" &&
				Number(result.rows[0].recruiter_id) === user.id);
		if (!allowed) return fail(res, 403, "You cannot delete this application.");
		await pool.query("DELETE FROM application WHERE application_id=$1", [id]);
		res.json({ message: "Application deleted." });
	}),
);

router.get(
	"/application-statuses",
	asyncRoute(async (_req, res) => {
		const result = await pool.query(
			"SELECT status_id,status_name FROM application_status ORDER BY status_id",
		);
		res.json({ rows: result.rows });
	}),
);
router.get(
	"/stats/application-status",
	requireRoles("ADMIN", "RECRUITER"),
	asyncRoute(async (_req, res) => {
		const result = await pool.query(
			`SELECT st.status_name, COUNT(a.application_id)::int AS application_count FROM application_status st LEFT JOIN application a ON a.status_id=st.status_id GROUP BY st.status_id,st.status_name ORDER BY st.status_id`,
		);
		res.json({ rows: result.rows });
	}),
);

router.post(
	"/external-jobs/search",
	asyncRoute(async (req, res) => {
		const keyword = text(req.body.keyword, 120, true);
		const location = text(req.body.location, 120, true);
		if (!keyword || !location)
			return fail(res, 400, "Enter both a job keyword and a location.");
		if (keyword.length < 2 || location.length < 2)
			return fail(
				res,
				400,
				"Keyword and location must each contain at least two characters.",
			);
		const appId = process.env.ADZUNA_APP_ID?.trim();
		const appKey = process.env.ADZUNA_APP_KEY?.trim();
		if (!appId || !appKey)
			return fail(
				res,
				503,
				"External job search is not configured. Add ADZUNA_APP_ID and ADZUNA_APP_KEY to your local .env file, then restart the server.",
			);

		const url = new URL("https://api.adzuna.com/v1/api/jobs/ca/search/1");
		url.search = new URLSearchParams({
			app_id: appId,
			app_key: appKey,
			what: keyword,
			where: location,
			results_per_page: "20",
			"content-type": "application/json",
		}).toString();
		let response;
		try {
			response = await fetch(url, {
				signal: AbortSignal.timeout(12000),
				headers: { Accept: "application/json" },
			});
		} catch (error) {
			return fail(
				res,
				502,
				"Could not contact the external job-search service. Check your internet connection and try again.",
			);
		}
		if (!response.ok) {
			console.error(`Adzuna request failed with HTTP ${response.status}.`);
			return fail(
				res,
				response.status === 429 ? 503 : 502,
				response.status === 429
					? "The job-search service rate limit was reached. Wait and try again."
					: "The external job-search service rejected the request. Check the API credentials and try again.",
			);
		}
		const payload = await response.json().catch(() => null);
		if (!payload || !Array.isArray(payload.results))
			return fail(
				res,
				502,
				"The external job-search service returned an unexpected response.",
			);

		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			const search = await client.query(
				`INSERT INTO external_job_search (user_id,session_id,keyword,location,result_count)
       VALUES ($1,$2,$3,$4,$5) RETURNING search_id,keyword,location,result_count,searched_at`,
				[
					req.session?.user?.id || null,
					req.sessionID || null,
					keyword,
					location,
					payload.results.length,
				],
			);
			const searchId = search.rows[0].search_id;
			for (const [index, job] of payload.results.entries()) {
				const redirectUrl =
					typeof job.redirect_url === "string" &&
					/^https:\/\//i.test(job.redirect_url)
						? job.redirect_url
						: null;
				const title = text(job.title, 255, true);
				if (!redirectUrl || !title) continue;
				const created =
					job.created && !Number.isNaN(Date.parse(job.created))
						? new Date(job.created)
						: null;
				const numericOrNull = (value) =>
					value != null && Number.isFinite(Number(value))
						? Number(value)
						: null;
				await client.query(
					`INSERT INTO external_job_result (search_id,source_job_id,title,company_name,location,description,salary_min,salary_max,redirect_url,category,published_at,source_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
					[
						searchId,
						String(job.id ?? `result-${index}`),
						title,
						text(job.company?.display_name, 255),
						text(job.location?.display_name, 255),
						text(job.description, 10000),
						numericOrNull(job.salary_min),
						numericOrNull(job.salary_max),
						redirectUrl,
						text(job.category?.label, 120),
						created,
						JSON.stringify(job),
					],
				);
			}
			const saved = await client.query(
				`SELECT result_id,source_job_id,title,company_name,location,description,salary_min,salary_max,redirect_url,category,published_at
       FROM external_job_result WHERE search_id=$1 ORDER BY published_at DESC NULLS LAST,result_id`,
				[searchId],
			);
			await client.query("COMMIT");
			res
				.status(201)
				.json({
					search: search.rows[0],
					rows: saved.rows,
					source: "Adzuna",
					sourceUrl: "https://www.adzuna.ca/",
				});
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}),
);

router.get(
	"/external-jobs/searches/:searchId",
	asyncRoute(async (req, res) => {
		const searchId = positiveId(req.params.searchId);
		if (!searchId)
			return fail(res, 400, "Search ID must be a positive integer.");
		const search = await pool.query(
			`SELECT search_id,keyword,location,result_count,searched_at FROM external_job_search
     WHERE search_id=$1 AND ((user_id IS NOT NULL AND user_id=$2) OR (user_id IS NULL AND session_id=$3))`,
			[searchId, req.session?.user?.id || null, req.sessionID || null],
		);
		if (!search.rowCount)
			return fail(res, 404, "Saved external job search was not found.");
		const results = await pool.query(
			`SELECT result_id,source_job_id,title,company_name,location,description,salary_min,salary_max,redirect_url,category,published_at
     FROM external_job_result WHERE search_id=$1 ORDER BY published_at DESC NULLS LAST,result_id`,
			[searchId],
		);
		res.json({
			search: search.rows[0],
			rows: results.rows,
			source: "Adzuna",
			sourceUrl: "https://www.adzuna.ca/",
		});
	}),
);

router.get(
	"/employers",
	requireRoles("ADMIN", "RECRUITER"),
	asyncRoute(async (req, res) => {
		let result;
		if (req.session.user.role === "RECRUITER")
			result = await pool.query(
				"SELECT e.employer_id,e.company_name FROM employer e JOIN recruiter r ON r.employer_id=e.employer_id WHERE r.recruiter_id=$1",
				[req.session.user.id],
			);
		else
			result = await pool.query(
				"SELECT employer_id,company_name FROM employer ORDER BY company_name",
			);
		res.json({ rows: result.rows });
	}),
);

router.post(
	"/recruiters",
	requireRoles("ADMIN"),
	asyncRoute(async (req, res) => {
		const email = text(req.body.email, 255, true)?.toLowerCase();
		const password = req.body.password;
		const firstName = text(req.body.firstName, 60, true);
		const lastName = text(req.body.lastName, 60, true);
		const jobTitle = text(req.body.jobTitle || "", 100) || null;
		const employerId = positiveId(req.body.employerId);
		const errors = [];
		if (!email || !EMAIL_RE.test(email))
			errors.push("Enter a valid email address.");
		if (
			typeof password !== "string" ||
			password.length < 10 ||
			password.length > 200
		)
			errors.push("Password must be 10–200 characters.");
		if (!firstName) errors.push("First name is required.");
		if (!lastName) errors.push("Last name is required.");
		if (!employerId) errors.push("Choose a valid employer.");
		if (errors.length)
			return fail(res, 400, "Please correct the recruiter fields.", errors);
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			const account = await client.query(
				"INSERT INTO app_user (email,password_hash,user_role) VALUES ($1,$2,'RECRUITER') RETURNING user_id,email,user_role",
				[email, await validatePassword(password)],
			);
			await client.query(
				"INSERT INTO recruiter (recruiter_id,employer_id,first_name,last_name,job_title) VALUES ($1,$2,$3,$4,$5)",
				[account.rows[0].user_id, employerId, firstName, lastName, jobTitle],
			);
			await client.query("COMMIT");
			res.status(201).json({ recruiter: account.rows[0] });
		} catch (error) {
			await client.query("ROLLBACK");
			if (error.code === "23505")
				return fail(res, 409, "An account with that email already exists.");
			return databaseError(res, error, "Recruiter creation failed");
		} finally {
			client.release();
		}
	}),
);

router.use((error, _req, res, _next) => {
	console.error("API request failed:", error.message);
	if (error.name === "AbortError" || error.name === "TimeoutError")
		return fail(
			res,
			504,
			"The external service took too long to respond. Please try again.",
		);
	if (
		/^[0-9A-Z]{5}$/.test(error.code || "") ||
		["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"].includes(error.code)
	)
		return fail(
			res,
			503,
			"A database or external service request failed. Check the connection and try again.",
		);
	return fail(res, 500, "Unexpected server error.");
});

module.exports = router;
