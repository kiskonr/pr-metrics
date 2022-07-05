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

const getAvgResumeData = (data, countPrs) => {
  return {
    firstReviewAvg: formatTime(data.firstReview / countPrs),
    getApprovesAvg: formatTime(data.getApproves / countPrs),
    reviewTimeAvg: formatTime(data.reviewTime / countPrs),
    leadTimeAvg: formatTime(data.leadTime / countPrs),
    filesChangedAvg: (data.filesChanged / countPrs).toFixed(2),
    changesAvg: (data.changes / countPrs).toFixed(2)
  };
};

const getAvgResumeDataByAuthor = (results) => {
  const byAuthorResults = {};
  results.forEach((result) => {
    const collection = byAuthorResults[result.author];
    if (!collection) {
      byAuthorResults[result.author] = [result];
    } else {
      collection.push(result);
    }
  });
  const resume = [];
  Object.keys(byAuthorResults).forEach((author) => {
    const results = byAuthorResults[author];
    const numberOfPRs = results.length;
    let filesChanged = 0;
    let changes = 0;
    let leadTimeRaw = 0;
    let timeToFirstReviewRaw = 0;
    let timeEnoughApprovesRaw = 0;
    let reviewTimeRaw = 0;
    results.forEach((result) => {
      filesChanged += result.filesChanged;
      changes += result.changes;
      leadTimeRaw += result.leadTimeRaw;
      timeToFirstReviewRaw += result.timeToFirstReviewRaw;
      timeEnoughApprovesRaw += result.timeEnoughApprovesRaw;
      reviewTimeRaw += result.reviewTimeRaw;
    });
    resume.push({
      author,
      numberOfPRs,
      filesChangedAvg: (filesChanged / numberOfPRs).toFixed(2),
      changesAvg: (changes / numberOfPRs).toFixed(2),
      leadTimeAvg: formatTime(leadTimeRaw / numberOfPRs),
      timeToFirstReviewAvg: formatTime(timeToFirstReviewRaw / numberOfPRs),
      timeEnoughApprovesAvg: formatTime(timeEnoughApprovesRaw / numberOfPRs),
      reviewTimeAvg: formatTime(reviewTimeRaw / numberOfPRs)
    });
  });
  return resume;
};

const getAvgResumeDataByGroup = (results) => {
  const groups = require('./groups.json');

  const byGroupResults = {};
  results.forEach((result) => {
    const userGroup = groups[result.author]
      ? groups[result.author]
      : 'withoutGroup';
    const collection = byGroupResults[userGroup];
    if (!collection) {
      byGroupResults[userGroup] = [result];
    } else {
      collection.push(result);
    }
  });
  const resume = [];
  Object.keys(byGroupResults).forEach((group) => {
    const results = byGroupResults[group];
    const numberOfPRs = results.length;
    let filesChanged = 0;
    let changes = 0;
    let leadTimeRaw = 0;
    let timeToFirstReviewRaw = 0;
    let timeEnoughApprovesRaw = 0;
    let reviewTimeRaw = 0;
    results.forEach((result) => {
      filesChanged += result.filesChanged;
      changes += result.changes;
      leadTimeRaw += result.leadTimeRaw;
      timeToFirstReviewRaw += result.timeToFirstReviewRaw;
      timeEnoughApprovesRaw += result.timeEnoughApprovesRaw;
      reviewTimeRaw += result.reviewTimeRaw;
    });
    resume.push({
      group,
      numberOfPRs,
      filesChangedAvg: (filesChanged / numberOfPRs).toFixed(2),
      changesAvg: (changes / numberOfPRs).toFixed(2),
      leadTimeAvg: formatTime(leadTimeRaw / numberOfPRs),
      timeToFirstReviewAvg: formatTime(timeToFirstReviewRaw / numberOfPRs),
      timeEnoughApprovesAvg: formatTime(timeEnoughApprovesRaw / numberOfPRs),
      reviewTimeAvg: formatTime(reviewTimeRaw / numberOfPRs)
    });
  });
  return resume;
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

  let resumeData = {
    firstReview: 0,
    getApproves: 0,
    reviewTime: 0,
    leadTime: 0,
    filesChanged: 0,
    changes: 0
  };
  const results = await Promise.all(
    prs.map(async (pr) => {
      const { number, closed_at, created_at } = pr;
      const closed = new Date(closed_at);
      const created = new Date(created_at);

      const files = await octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{number}/files',
        {
          owner: process.env.REPO_OWNER,
          repo: process.env.REPO_NAME,
          number,
          per_page: 100
        }
      );

      const changes = files.data.reduce(
        (sumChanges, fileChange) => fileChange.changes + sumChanges,
        0
      );

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
      if (!reviews.data[0]) {
        return {
          number,
          createdAt: created.toISOString(),
          closedAt: closed.toISOString(),
          firstReview: 0,
          getApproves: 0,
          reviewTime: 0,
          leadTime: 0,
          filesChanged: files.data.length,
          changes
        };
      }
      const firstReview = new Date(reviews.data[0].submitted_at);
      const timeToFirstReview = timeDiff(firstReview, created);

      // Time to get enough approves from first review
      const timeEnoughApproves =
        approves.approves >= getRequiredApproves.requiredApproves
          ? timeDiff(approves.dateEnoughApproves, firstReview)
          : timeDiff(approves.firstApprove, firstReview);

      // Review time
      const reviewTime = timeDiff(closed, firstReview);

      // Lead time
      const leadTime = timeDiff(closed, created);

      resumeData.firstReview += timeToFirstReview;
      resumeData.getApproves += timeEnoughApproves;
      resumeData.reviewTime += reviewTime;
      resumeData.leadTime += leadTime;
      resumeData.filesChanged += files.data.length;
      resumeData.changes += changes;

      return {
        number,
        createdAt: created.toISOString(),
        closedAt: closed.toISOString(),
        filesChanged: files.data.length,
        changes,
        firstReview: formatTime(timeToFirstReview),
        timeToFirstReviewRaw: timeToFirstReview,
        getApproves: formatTime(timeEnoughApproves),
        timeEnoughApprovesRaw: timeEnoughApproves,
        reviewTime: formatTime(reviewTime),
        reviewTimeRaw: reviewTime,
        leadTime: formatTime(leadTime),
        leadTimeRaw: leadTime,
        author: pr.user.login
      };
    })
  );

  console.table(results);
  console.table(getAvgResumeDataByAuthor(results));
  console.table(getAvgResumeDataByGroup(results));
  console.table([getAvgResumeData(resumeData, results.length)]);
}

main();
