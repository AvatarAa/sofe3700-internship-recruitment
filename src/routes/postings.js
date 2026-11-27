const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        posting_id,
        title,
        company_name,
        location,
        work_mode,
        min_salary,
        max_salary,
        deadline,
        recruiter_email
      FROM v_open_internship_postings
      ORDER BY deadline ASC, posting_id ASC
    `);

    res.json({
      count: result.rowCount,
      postings: result.rows,
    });
  } catch (error) {
    console.error("Could not load internship postings:", error.message);

    res.status(500).json({
      status: "error",
      message: "Could not load internship postings",
    });
  }
});

router.get("/:postingId", async (req, res) => {
  const postingId = Number(req.params.postingId);

  if (!Number.isInteger(postingId) || postingId < 1) {
    return res.status(400).json({
      status: "error",
      message: "Posting ID must be a positive integer",
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          posting_id,
          title,
          company_name,
          location,
          work_mode,
          min_salary,
          max_salary,
          deadline,
          recruiter_email
        FROM v_open_internship_postings
        WHERE posting_id = $1
      `,
      [postingId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Open posting not found",
      });
    }

    res.json({
      posting: result.rows[0],
    });
  } catch (error) {
    console.error("Could not load internship posting:", error.message);

    res.status(500).json({
      status: "error",
      message: "Could not load internship posting",
    });
  }
});

module.exports = router;