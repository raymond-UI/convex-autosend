import { httpRouter } from "convex/server";
import { registerRoutes } from "@mzedstudio/autosend";
import { components } from "./_generated/api";

const http = httpRouter();
registerRoutes(http, components.autosend);

export default http;
