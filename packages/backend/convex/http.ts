import { httpRouter } from "convex/server";

import { preflight, profileImage, upload } from "./newsfeed/upload";
const http = httpRouter();
http.route({ path: "/newsfeed/upload", method: "POST", handler: upload });
http.route({ path: "/newsfeed/upload", method: "OPTIONS", handler: preflight });
http.route({ path: "/newsfeed/profile-image", method: "POST", handler: profileImage });
http.route({ path: "/newsfeed/profile-image", method: "OPTIONS", handler: preflight });
export default http;
