/**
 * ========================================
 * SuperEditor 应用配置文件
 * ========================================
 *
 * 本文件定义了 SuperEditor 应用的全局配置常量和环境变量接口
 * 包含数据库连接信息、应用名称等核心配置项
 */

/**
 * 应用全局配置常量
 * 包含 Supabase 数据库连接信息和应用基本设置
 */
export const CONFIG = {
  /** Supabase 数据库服务地址 - 生产环境中应通过环境变量设置 */
  SUPABASE_URL: 'https://vlpwtmzlcgqszrbrxlaz.supabase.co',

  /** Supabase 匿名访问密钥 - 生产环境中应通过环境变量设置 */
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZscHd0bXpsY2dxc3pyYnJ4bGF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0OTk3MjksImV4cCI6MjA3ODA3NTcyOX0._RTqczLtWm9TVqAGG8kk2WodrPGVXmt_GnxJp6ZP_kU',

  /** 应用名称 */
  APP_NAME: 'SuperEditor'
};

/**
 * Cloudflare Workers 环境变量接口定义
 * 定义了应用运行时所需的环境变量类型
 */
export interface Env {
  /** Supabase 数据库服务 URL */
  SUPABASE_URL: string;

  /** Supabase 匿名访问密钥 - 用于客户端访问 */
  SUPABASE_ANON_KEY: string;

  /** Supabase 服务角色密钥 - 用于服务端特权操作 */
  SUPABASE_SERVICE_ROLE_KEY: string;

  /** Cloudflare R2 存储桶实例 - 用于文件存储 */
  R2_BUCKET: R2Bucket;
}