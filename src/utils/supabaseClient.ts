/**
 * ========================================
 * Supabase 数据库客户端工具
 * ========================================
 *
 * 本文件提供 Supabase 数据库客户端的创建和管理功能
 * 包含数据模型定义和客户端工厂函数
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from '../config';

/**
 * ========================================
 * 数据模型定义
 * ========================================
 */

/**
 * 文档数据模型接口
 * 定义了文档实体的数据结构和字段类型
 */
export interface Document {
  /** 文档唯一标识符 - 可选字段，由数据库自动生成 */
  id?: string;

  /** 文档标题 - 必填字段 */
  title: string;

  /** 文档内容 - 必填字段，支持 Markdown 格式 */
  content: string;

  /** 所属用户ID - 必填字段，用于关联用户 */
  user_id: string;

  /** 文档创建时间 - 可选字段，由数据库自动生成 */
  created_at?: string;

  /** 文档更新时间 - 可选字段，由数据库自动更新 */
  updated_at?: string;
}

/**
 * ========================================
 * Supabase 客户端工厂函数
 * ========================================
 */

/**
 * 创建 Supabase 数据库客户端实例
 *
 * @param supabaseUrl - Supabase 项目的 URL 地址
 * @param supabaseKey - Supabase 项目的访问密钥
 * @returns SupabaseClient 实例，用于数据库操作
 *
 * @example
 * ```typescript
 * const client = createSupabaseClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
 * const { data, error } = await client.from('documents').select('*');
 * ```
 */
export const createSupabaseClient = (supabaseUrl: string, supabaseKey: string): SupabaseClient => {
  return createClient(supabaseUrl, supabaseKey);
};