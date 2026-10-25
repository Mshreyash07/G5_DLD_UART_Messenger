import { Router, type IRouter } from "express";
import healthRouter from "./health";
import hdlRouter from "./hdl";

const router: IRouter = Router();

router.use(healthRouter);
router.use(hdlRouter);

export default router;
