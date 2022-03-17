const dotenv = require('dotenv');
const inquirer = require('inquirer');
const { Octokit } = require('@octokit/rest');

dotenv.config();

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const timeDiff = (dateFuture, dateNow) => {
  return Math.abs(dateFuture - dateNow) / 1000;
};

const formatTime = (time) => {
  // calculate days
  const days = Math.floor(time / 86400);
  time -= days * 86400;

  // calculate hours
  const hours = Math.floor(time / 3600) % 24;
  time -= hours * 3600;

  // calculate minutes
  const minutes = Math.floor(time / 60) % 60;
  time -= minutes * 60;

  let difference = '';
  if (days > 0) {
    difference += days === 1 ? `${days} day, ` : `${days} days, `;
  }

  difference +=
    hours === 0 || hours === 1 ? `${hours} hour, ` : `${hours} hours, `;

  difference +=
    minutes === 0 || hours === 1 ? `${minutes} minutes` : `${minutes} minutes`;

  return difference;
};

const getPRs = async (
  initDate,
  endDate,
  branch,
  page = 1,
  resultsPerPage = 50
) => {
  const q = `repo:${process.env.REPO_OWNER}/${process.env.REPO_NAME}+is:pr+is:closed+merged:${initDate}..${endDate}+base:${branch}+sort:updated-desc`;
  const results = await octokit.request(`GET /search/issues`, {
    q,
    page,
    per_page: resultsPerPage
  });

  return results.data;
};

const getAvgTimes = (times, countPrs) => {
  return {
    firstReviewAvg: formatTime(times.firstReview / countPrs),
    getApprovesAvg: formatTime(times.getApproves / countPrs),
    reviewTimeAvg: formatTime(times.reviewTime / countPrs),
    timeToMergeAvg: formatTime(times.timeToMerge / countPrs)
  };
};

async function main() {
  const getBranch = await inquirer.prompt({
    type: 'input',
    name: 'branch',
    default: 'master',
    message: 'What is the base branch?'
  });

  const getDateStart = await inquirer.prompt({
    type: 'input',
    name: 'date',
    message: 'What is the initial date (YYYY-MM-DD)?'
  });

  const getDateEnd = await inquirer.prompt({
    type: 'input',
    name: 'date',
    message: 'What is the end date (YYYY-MM-DD)?'
  });

  const getRequiredApproves = await inquirer.prompt({
    type: 'number',
    name: 'requiredApproves',
    default: 2,
    message: 'What is the number of required approves to merge?'
  });

  let moreResults = true;
  let page = 1;
  let prs = [];
  while (moreResults) {
    const data = await getPRs(
      getDateStart.date,
      getDateEnd.date,
      getBranch.branch,
      page
    );
    prs = prs.concat(data.items);

    if (prs.length >= data.total_count) {
      moreResults = false;
    }

    page += 1;
  }

  let times = {
    firstReview: 0,
    getApproves: 0,
    reviewTime: 0,
    timeToMerge: 0
  };
  const results = await Promise.all(
    prs.map(async (pr) => {
      const { number, closed_at, created_at } = pr;
      const closed = new Date(closed_at);
      const created = new Date(created_at);

      const reviews = await octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{number}/reviews',
        {
          owner: process.env.REPO_OWNER,
          repo: process.env.REPO_NAME,
          number,
          per_page: 100
        }
      );

      const approves = reviews.data.reduce(
        (prev, review) => {
          if (review.state === 'APPROVED') {
            prev.approves += 1;
            if (prev.approves === 1) {
              prev.firstApprove = new Date(review.submitted_at);
            }
          }
          if (prev.approves === getRequiredApproves.requiredApproves) {
            prev.dateEnoughApproves = new Date(review.submitted_at);
          }

          return prev;
        },
        { approves: 0, firstApprove: undefined, dateEnoughApproves: undefined }
      );

      // Time to first review (in days or hours)
      const firstReview = new Date(reviews.data[0].submitted_at);
      const timeToFirstReview = timeDiff(firstReview, created);

      // Time to get enough approves from first review
      const timeEnoughApproves =
        approves.approves >= getRequiredApproves.requiredApproves
          ? timeDiff(approves.dateEnoughApproves, firstReview)
          : timeDiff(approves.firstApprove, firstReview);

      // Review time
      const reviewTime = timeDiff(closed, firstReview);

      // Time to merge
      const timeToMerge = timeDiff(closed, created);

      times.firstReview += timeToFirstReview;
      times.getApproves += timeEnoughApproves;
      times.reviewTime += reviewTime;
      times.timeToMerge += timeToMerge;

      return {
        number,
        createdAt: created.toISOString(),
        closedAt: closed.toISOString(),
        firstReview: formatTime(timeToFirstReview),
        getApproves: formatTime(timeEnoughApproves),
        reviewTime: formatTime(reviewTime),
        timeToMerge: formatTime(timeToMerge)
      };
    })
  );

  console.table(results);
  console.table([getAvgTimes(times, results.length)]);
}

main();
