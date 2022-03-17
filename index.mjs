#!/usr/bin/env zx

const timeDiffCalc = (dateFuture, dateNow) => {
  let diffInMilliSeconds = Math.abs(dateFuture - dateNow) / 1000;

  // calculate days
  const days = Math.floor(diffInMilliSeconds / 86400);
  diffInMilliSeconds -= days * 86400;
  // console.log('calculated days', days);

  // calculate hours
  const hours = Math.floor(diffInMilliSeconds / 3600) % 24;
  diffInMilliSeconds -= hours * 3600;
  // console.log('calculated hours', hours);

  // calculate minutes
  const minutes = Math.floor(diffInMilliSeconds / 60) % 60;
  diffInMilliSeconds -= minutes * 60;
  // console.log('minutes', minutes);

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

const getPRs = async (page = 1, resultsPerPage = 50) => {
  const q = `q=repo:${owner}/${repo}+is:pr+is:closed+merged:2022-02-17..2022-02-22+base:${branch}+sort:updated-desc`;

  const results = await $`curl -s -u "${user}:${token}" \
    -H "Accept: application/vnd.github.v3+json" \
    https://api.github.com/search/issues?${q} | jq '.[]'`;

  //console.log('q ->', q, results.total_count);

  return results;
};

const repo = await question('Type de repo name: ');
const owner = await question('Type the repo owner: ');
const branch = await question('Type the base branch: ', {
  choices: ['master', 'main']
});
const user = await question('Type your Github username: ');
const token = await question('Type your Github password or token: ');

const prs = await getPRs();

await $`echo ${results.total_count}`;

/*
await $`cat package.json | grep name`

let branch = await $`git branch --show-current`
await $`dep deploy --branch=${branch}`

await Promise.all([
  $`sleep 1; echo 1`,
  $`sleep 2; echo 2`,
  $`sleep 3; echo 3`,
])

let name = 'foo bar'
await $`mkdir /tmp/${name}`*/
