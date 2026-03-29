import { Router, type IRouter } from "express";
import healthRouter from "./health";
import comfyuiRouter from "./comfyui";

const router: IRouter = Router();

router.use(healthRouter);
router.use(comfyuiRouter);

export default router;
