import { httpRouter } from "convex/server";

import { preflight, upload } from "./newsfeed/upload";
const http = httpRouter();
http.route({ path: "/newsfeed/upload", method: "POST", handler: upload });
http.route({ path: "/newsfeed/upload", method: "OPTIONS", handler: preflight });
export default http;
