import { Router, type IRouter } from "express";
import healthRouter from "./health";
import imageRouter from "./image";
import videoRouter from "./video";
import animatediffRouter from "./animatediff";
import svdRouter from "./svd";
import opensoraRouter from "./opensora";
import universalVideoRouter from "./univideo";
import comfyuiRouter from "./comfyui";

const router: IRouter = Router();

router.use(healthRouter);
router.use(imageRouter);
router.use(videoRouter);
router.use(animatediffRouter);
router.use(svdRouter);
router.use(opensoraRouter);
router.use(universalVideoRouter);
router.use(comfyuiRouter);

export default router;
