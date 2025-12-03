/**
 * ========================================
 * 用户认证路由模块
 * ========================================
 *
 * 本文件提供用户认证相关的 HTTP 路由处理
 * 包括用户登录、注册、登出和获取当前用户信息等功能
 * 使用 Supabase Auth 进行身份验证，通过 Cookie 管理会话状态
 */

import { Hono } from "hono";
import { setCookie, deleteCookie } from 'hono/cookie';
import { createSupabaseClient } from "../utils/supabaseClient";
import { AppContext } from "../types/context";
import {
  setAuthCookies,
  clearAuthCookies,
  calculateSessionExpiry,
  createAuthError,
  DEFAULT_SESSION_DURATION,
  LONG_SESSION_DURATION
} from "../utils/sessionUtils";

/**
 * 创建认证路由实例
 * 使用 AppContext 类型确保类型安全
 */
const auth = new Hono<AppContext>();

/**
 * ========================================
 * 认证路由处理函数
 * ========================================
 */

/**
 * 用户登录路由
 *
 * 路由：POST /api/auth/login
 *
 * 功能：
 * - 验证用户邮箱和密码
 * - 创建用户会话
 * - 设置认证 Cookie（包含记住我功能）
 * - 正确处理令牌过期时间
 *
 * 请求体：
 * ```json
 * {
 *   "email": "user@example.com",
 *   "password": "password123",
 *   "rememberMe": true
 * }
 * ```
 *
 * 响应：
 * ```json
 * {
 *   "message": "Login successful",
 *   "user": {
 *     "id": "user_id",
 *     "email": "user@example.com"
 *   },
 *   "sessionExpiresIn": 1209600,
 *   "rememberMe": true
 * }
 * ```
 */
auth.post("/login", async (c) => {
  // 从请求体中获取登录凭据和记住用户选项
  const { email, password, rememberMe = false } = await c.req.json();

  // 创建 Supabase 客户端实例
  const supabase = createSupabaseClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY
  );

  // 使用邮箱和密码进行身份验证
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  // 处理登录失败的情况
  if (error) {
    console.error('Login error:', error.message);
    return c.json({
      error: error.message,
      code: 'LOGIN_FAILED'
    }, 400);
  }

  // 设置认证 Cookie
  if (data.session) {
    setAuthCookies(
      c,
      data.session.access_token,
      data.session.refresh_token,
      rememberMe
    );
  }

  // 计算会话过期信息
  const sessionDuration = rememberMe ? LONG_SESSION_DURATION : DEFAULT_SESSION_DURATION;
  const expiresAt = calculateSessionExpiry(rememberMe);

  // 返回登录成功响应，包含会话过期信息
  return c.json({
    message: "Login successful",
    user: data.user,
    rememberMe: rememberMe,
    sessionExpiresIn: sessionDuration,
    expiresAt: new Date(expiresAt).toISOString()
  });
});

/**
 * 获取当前用户信息路由
 *
 * 路由：GET /api/auth/me
 *
 * 功能：
 * - 验证用户身份
 * - 返回当前用户信息
 *
 * 响应：
 * ```json
 * {
 *   "user": { "id": "user_id", "email": "user@example.com" },
 *   "email": "user@example.com",
 *   "name": "username"
 * }
 * ```
 */
auth.get("/me", async (c) => {
  // 创建 Supabase 客户端实例
  const supabase = createSupabaseClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY
  );

  // 从 Cookie 中提取访问令牌
  const token = c.req.header('Cookie')?.match(/access_token=([^;]+)/)?.[1];

  // 检查令牌是否存在
  if (!token) {
    return c.json({ error: "Not authenticated" }, 401);
  }

  // 验证令牌并获取用户信息
  const { data, error } = await supabase.auth.getUser(token);

  // 处理令牌验证失败
  if (error) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // 返回用户信息，包含用户名（优先使用元数据中的名称，否则使用邮箱前缀）
  return c.json({
    user: data.user,
    email: data.user?.email,
    name: data.user?.user_metadata?.name || data.user?.email?.split('@')[0] || 'User'
  });
});

/**
 * 用户登出路由
 *
 * 路由：POST /api/auth/logout
 *
 * 功能：
 * - 清除用户会话
 * - 删除所有认证相关的 Cookie（包括 remember_me）
 * - 在服务器端撤销令牌
 *
 * 响应：
 * ```json
 * {
 *   "message": "Logout successful"
 * }
 * ```
 */
auth.post("/logout", async (c) => {
  // 创建 Supabase 客户端实例
  const supabase = createSupabaseClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY
  );

  // 从 Cookie 中提取访问令牌
  const token = c.req.header('Cookie')?.match(/access_token=([^;]+)/)?.[1];

  // 如果令牌存在，执行登出操作
  if (token) {
    try {
      await supabase.auth.signOut();
      console.log('User logout successful');
    } catch (error) {
      console.error('Logout error:', error);
      // 即使服务器端登出失败，也继续清除客户端 Cookie
    }
  }

  // 删除所有认证相关的 Cookie
  clearAuthCookies(c);

  // 返回登出成功响应
  return c.json({
    message: "Logout successful",
    timestamp: new Date().toISOString()
  });
});

/**
 * 用户注册路由
 *
 * 路由：POST /api/auth/register
 *
 * 功能：
 * - 创建新用户账户
 * - 发送邮箱验证（如配置）
 *
 * 请求体：
 * ```json
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 * ```
 *
 * 响应：
 * ```json
 * {
 *   "message": "Registration successful",
 *   "user": {
 *     "id": "user_id",
 *     "email": "user@example.com"
 *   }
 * }
 * ```
 */
auth.post("/register", async (c) => {
  // 从请求体中获取注册信息
  const { email, password } = await c.req.json();

  // 创建 Supabase 客户端实例
  const supabase = createSupabaseClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY
  );

  // 创建新用户账户
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  // 处理注册失败的情况
  if (error) {
    return c.json({ error: error.message }, 400);
  }

  // 返回注册成功响应
  return c.json({
    message: "Registration successful",
    user: data.user
  });
});

/**
 * 导出认证路由模块
 * 供主应用文件挂载使用
 */
export default auth;