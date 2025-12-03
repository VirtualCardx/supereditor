/**
 * ========================================
 * SuperEditor 应用主入口文件
 * ========================================
 *
 * 本文件是 SuperEditor 应用的主入口点，基于 Hono 框架构建
 * 负责路由配置、中间件设置和模块集成
 */

import { Hono } from "hono";
import { AppContext } from "./types/context";
import auth from "./routes/auth";
import documents from "./routes/documents";
import folders from "./routes/folders";
import images from "./routes/images";
import files from "./routes/files";
import { authMiddleware } from "./middleware/authMiddleware";

/**
 * 创建 Hono 应用实例
 * 使用 AppContext 类型确保类型安全
 */
const app = new Hono<AppContext>();

/**
 * ========================================
 * 基础路由配置
 * ========================================
 */

/**
 * 应用健康检查路由
 * 用于测试应用是否正常运行
 */
app.get("/", (c) => {
  return c.text("SuperEditor is running!");
});

/**
 * API 测试路由
 * 用于验证 API 基础功能
 */
app.get("/api/message", (c) => {
  return c.text("Hello Hono!");
});

/**
 * ========================================
 * 模块路由挂载
 * ========================================
 */

/**
 * 认证相关路由
 * 处理用户登录、注册、登出等认证操作
 * 路径前缀: /api/auth
 * 包含: 登录、注册、获取用户信息等
 */
app.route("/api/auth", auth);

/**
 * ========================================
 * 受保护的路由配置
 * ========================================
 * 以下路由需要用户认证才能访问
 */

/**
 * 文档管理路由 (受认证保护)
 * 处理文档的增删改查操作
 * 路径前缀: /api/documents
 * 包含: 获取文档列表、创建文档、更新文档、删除文档等
 */
app.use("/api/documents/*", authMiddleware);
app.route("/api/documents", documents);

/**
 * 文件夹管理路由 (受认证保护)
 * 处理文件夹的增删改查操作
 * 路径前缀: /api/folders
 * 包含: 获取文件夹列表、创建文件夹、更新文件夹、删除文件夹等
 */
app.use("/api/folders/*", authMiddleware);
app.route("/api/folders", folders);

/**
 * 图片处理路由 (受认证保护)
 * 处理图片上传和访问
 * 路径前缀: /api/images
 * 包含: 图片上传、图片访问、图片列表、删除图片等
 */
app.use("/api/images/*", authMiddleware);
app.route("/api/images", images);

/**
 * 文件处理路由 (受认证保护)
 * 处理文件上传、下载、管理等完整功能
 * 路径前缀: /api/files
 * 包含: 文件上传、下载、删除、重命名、文件夹管理等
 */
app.use("/api/files/*", authMiddleware);
app.route("/api/files", files);

/**
 * 导出应用实例
 * 供 Cloudflare Workers 部署使用
 */
export default app;