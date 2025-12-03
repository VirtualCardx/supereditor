/**
 * ========================================
 * 用户认证中间件
 * ========================================
 *
 * 本文件提供基于 Supabase 的用户认证验证中间件
 * 用于保护需要用户身份验证的 API 路由
 * 通过 Cookie 中的访问令牌验证用户身份，并将用户信息注入到请求上下文中
 */

import { createMiddleware } from 'hono/factory';
import { getCookie, setCookie } from 'hono/cookie';
import { createSupabaseClient } from '../utils/supabaseClient';
import {
  clearAuthCookies as clearSessionCookies,
  getRememberMeSetting,
  isSessionExpiredError,
  DEFAULT_SESSION_DURATION,
  LONG_SESSION_DURATION,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE
} from '../utils/sessionUtils';

/**
 * ========================================
 * 认证中间件辅助函数
 * ========================================
 */

/**
 * 设置安全认证 Cookie
 *
 * @param c - Hono 上下文对象
 * @param name - Cookie 名称
 * @param value - Cookie 值
 * @param maxAge - Cookie 过期时间（秒）
 */
const setAuthCookie = (c: any, name: string, value: string, maxAge: number) => {
  setCookie(c, name, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge
  });
};

/**
 * 用户认证中间件
 *
 * 功能：
 * 1. 从请求 Cookie 中提取访问令牌和刷新令牌
 * 2. 验证访问令牌的有效性
 * 3. 如果访问令牌过期，自动使用刷新令牌更新会话
 * 4. 将用户信息注入到请求上下文中
 * 5. 保护需要认证的路由
 *
 * 认证流程：
 * - 检查 Cookie 中的 access_token 和 refresh_token
 * - 使用 Supabase 验证访问令牌
 * - 如果访问令牌过期且有刷新令牌，自动刷新会话
 * - 更新 Cookie 中的令牌，保持原有的记住我设置
 * - 将验证通过的用户信息设置到上下文
 * - 继续执行后续处理器
 *
 * @param c - Hono 上下文对象
 * @param next - 下一个中间件函数
 * @returns 如果认证失败，返回 401 错误；如果成功，继续执行后续处理
 *
 * @example
 * ```typescript
 * // 在路由中使用认证中间件
 * app.use('/api/protected/*', authMiddleware);
 * ```
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  // 创建 Supabase 客户端实例
  // 优先使用服务角色密钥，如果不存在则使用匿名密钥
  const supabase = createSupabaseClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_SERVICE_ROLE_KEY || c.env.SUPABASE_ANON_KEY
  );

  // 从 Cookie 中获取访问令牌和刷新令牌
  const accessToken = getCookie(c, ACCESS_TOKEN_COOKIE);
  const refreshToken = getCookie(c, REFRESH_TOKEN_COOKIE);

  // 检查访问令牌是否存在
  if (!accessToken) {
    return c.json({
      error: 'Unauthorized - No access token provided',
      code: 'NO_TOKEN'
    }, 401);
  }

  // 使用 Supabase 验证访问令牌
  let { data, error } = await supabase.auth.getUser(accessToken);

  // 如果访问令牌失效且有刷新令牌，尝试刷新会话
  if ((error || !data?.user) && refreshToken) {
    try {
      console.log('Access token expired, attempting refresh...');

      // 使用刷新令牌获取新的会话
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession(refreshToken);

      if (!refreshError && refreshData.session) {
        console.log('Token refresh successful');

        // 刷新成功，验证新的访问令牌
        const verifyResult = await supabase.auth.getUser(refreshData.session.access_token);

        if (!verifyResult.error && verifyResult.data?.user) {
          // 更新用户数据和验证状态
          data = verifyResult.data;
          error = null;

          // 获取用户的原始记住我设置
          const rememberMe = getRememberMeSetting(c);
          const maxAge = rememberMe ? LONG_SESSION_DURATION : DEFAULT_SESSION_DURATION;

          console.log(`Updating cookies with maxAge: ${maxAge}s (${rememberMe ? '14 days' : '48 hours'})`);

          // 更新访问令牌 Cookie
          setAuthCookie(c, ACCESS_TOKEN_COOKIE, refreshData.session.access_token, maxAge);

          // 如果有新的刷新令牌，也更新它
          if (refreshData.session.refresh_token) {
            setAuthCookie(c, REFRESH_TOKEN_COOKIE, refreshData.session.refresh_token, maxAge);
          }
        }
      } else {
        console.log('Token refresh failed:', refreshError?.message);
      }
    } catch (refreshError) {
      console.error('Token refresh error:', refreshError);
    }
  }

  // 检查最终令牌验证结果
  if (error || !data?.user) {
    console.log('Authentication failed:', error?.message);

    // 如果刷新也失败了，清除所有认证相关的 Cookie
    clearSessionCookies(c);

    return c.json({
      error: 'Invalid token - Authentication failed',
      code: isSessionExpiredError(error) ? 'SESSION_EXPIRED' : 'AUTH_FAILED'
    }, 401);
  }

  // 将验证通过的用户信息注入到上下文中
  // 后续的路由处理器可以通过 c.get('user') 获取用户信息
  c.set('user', data.user);

  // 继续执行下一个中间件或路由处理器
  await next();
});