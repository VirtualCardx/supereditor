/**
 * ========================================
 * 会话管理工具函数
 * ========================================
 *
 * 本文件提供会话管理相关的工具函数
 * 包含 Cookie 操作、令牌验证、会话状态检查等功能
 */

import { setCookie, deleteCookie, getCookie } from 'hono/cookie';

/**
 * ========================================
 * 常量定义
 * ========================================
 */

/** 默认会话持续时间（秒）- 48 小时 */
export const DEFAULT_SESSION_DURATION = 60 * 60 * 48;

/** 长期会话持续时间（秒）- 14 天 */
export const LONG_SESSION_DURATION = 60 * 60 * 24 * 14;

/** 访问令牌 Cookie 名称 */
export const ACCESS_TOKEN_COOKIE = 'access_token';

/** 刷新令牌 Cookie 名称 */
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** 记住我标识 Cookie 名称 */
export const REMEMBER_ME_COOKIE = 'remember_me';

/**
 * ========================================
 * Cookie 管理函数
 * ========================================
 */

/**
 * 设置认证相关的 Cookie
 *
 * @param c - Hono 上下文对象
 * @param accessToken - 访问令牌
 * @param refreshToken - 刷新令牌（可选）
 * @param rememberMe - 是否记住用户
 */
export const setAuthCookies = (
  c: any,
  accessToken: string,
  refreshToken?: string,
  rememberMe: boolean = false
) => {
  const maxAge = rememberMe ? LONG_SESSION_DURATION : DEFAULT_SESSION_DURATION;

  console.log(`Setting auth cookies with maxAge: ${maxAge}s (${rememberMe ? '14 days' : '48 hours'})`);

  // 设置访问令牌 Cookie
  setCookie(c, ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge
  });

  // 设置刷新令牌 Cookie（如果提供）
  if (refreshToken) {
    setCookie(c, REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge
    });
  }

  // 设置记住我标识 Cookie
  setCookie(c, REMEMBER_ME_COOKIE, rememberMe ? 'true' : 'false', {
    httpOnly: false, // 允许客户端 JavaScript 读取
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge
  });
};

/**
 * 清除所有认证相关的 Cookie
 *
 * @param c - Hono 上下文对象
 */
export const clearAuthCookies = (c: any) => {
  console.log('Clearing all auth cookies');

  deleteCookie(c, ACCESS_TOKEN_COOKIE, { path: '/' });
  deleteCookie(c, REFRESH_TOKEN_COOKIE, { path: '/' });
  deleteCookie(c, REMEMBER_ME_COOKIE, { path: '/' });
};

/**
 * 检查是否存在有效的认证 Cookie
 *
 * @param c - Hono 上下文对象
 * @returns 是否存在访问令牌
 */
export const hasValidAuthCookies = (c: any): boolean => {
  const accessToken = getCookie(c, ACCESS_TOKEN_COOKIE);
  return !!accessToken;
};

/**
 * 获取记住我设置
 *
 * @param c - Hono 上下文对象
 * @returns 是否选择了记住我
 */
export const getRememberMeSetting = (c: any): boolean => {
  const rememberMe = getCookie(c, REMEMBER_ME_COOKIE);
  return rememberMe === 'true';
};

/**
 * ========================================
 * 会话验证函数
 * ========================================
 */

/**
 * 计算会话过期时间
 *
 * @param rememberMe - 是否记住用户
 * @returns 过期时间戳（毫秒）
 */
export const calculateSessionExpiry = (rememberMe: boolean = false): number => {
  const duration = rememberMe ? LONG_SESSION_DURATION : DEFAULT_SESSION_DURATION;
  return Date.now() + (duration * 1000);
};

/**
 * 检查会话是否即将过期（1小时内）
 *
 * @param expiresAt - 过期时间戳（毫秒）
 * @returns 是否即将过期
 */
export const isSessionExpiringSoon = (expiresAt: number): boolean => {
  const oneHourFromNow = Date.now() + (60 * 60 * 1000);
  return expiresAt <= oneHourFromNow;
};

/**
 * 格式化会话剩余时间为人类可读格式
 *
 * @param expiresAt - 过期时间戳（毫秒）
 * @returns 格式化的剩余时间字符串
 */
export const formatSessionTimeRemaining = (expiresAt: number): string => {
  const now = Date.now();
  const remaining = Math.max(0, expiresAt - now);

  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}天${hours}小时`;
  } else if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  } else if (minutes > 0) {
    return `${minutes}分钟`;
  } else {
    return '即将过期';
  }
};

/**
 * ========================================
 * 错误处理函数
 * ========================================
 */

/**
 * 创建标准化的认证错误响应
 *
 * @param message - 错误消息
 * @param code - 错误代码
 * @param statusCode - HTTP 状态码
 * @returns 标准化的错误对象
 */
export const createAuthError = (message: string, code: string, statusCode: number = 401) => {
  return {
    error: message,
    code,
    timestamp: new Date().toISOString()
  };
};

/**
 * 检查是否为会话过期错误
 *
 * @param error - Supabase 错误对象
 * @returns 是否为会话过期错误
 */
export const isSessionExpiredError = (error: any): boolean => {
  if (!error) return false;

  const sessionExpiredCodes = [
    'invalid_token',
    'token_expired',
    'session_not_found'
  ];

  return sessionExpiredCodes.includes(error.code) ||
         error.message?.includes('expired') ||
         error.message?.includes('invalid token');
};