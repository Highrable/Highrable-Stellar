import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "scan deadline reminders",
  { minutes: 15 },
  internal.deadlines.scanUpcomingDeadlines,
  {},
);

crons.interval("clean social uploads", { minutes: 15 }, internal.newsfeed.media.cleanup, {});

export default crons;
