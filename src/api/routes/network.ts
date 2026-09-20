import { Router } from "express";
import { getNetworkDirectory } from "../../services/network.js";

export const networkRouter = Router();

// Mounted behind requireSession. This is the discoverable directory, not a
// raw database dump: hidden actors and private memberships/contacts never leave
// the service, including for the signed-in person's own directory entry.
networkRouter.get("/network", async (_req, res, next) => {
  try {
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await getNetworkDirectory());
  } catch (error) {
    next(error);
  }
});
