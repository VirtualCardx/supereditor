/**
 * ========================================
 * 文档管理路由模块
 * ========================================
 *
 * 本文件提供文档的 CRUD 操作 HTTP 路由处理
 * 所有路由都需要用户认证，确保用户只能操作自己的文档
 * 支持获取文档列表、获取单个文档、创建文档、更新文档和删除文档
 */

import { Hono } from "hono";
import { createSupabaseClient } from "../utils/supabaseClient";
import { AppContext } from "../types/context";

/**
 * 创建文档管理路由实例
 * 使用 AppContext 类型确保类型安全
 * 所有路由都需要通过 authMiddleware 认证
 */
const documents = new Hono<AppContext>();

/**
 * ========================================
 * 文档 CRUD 操作路由
 * ========================================
 */

/**
 * 获取用户文档列表路由（支持分页和文件夹过滤）
 *
 * 路由：GET /api/documents
 *
 * 查询参数：
 * - page: 页码（从1开始，默认为1）
 * - limit: 每页记录数（默认为12，最大为50）
 * - folder_id: 文件夹ID（可选，null表示获取未分类文档）
 *
 * 功能：
 * - 获取当前用户的文档
 * - 支持按文件夹过滤
 * - 按更新时间降序排列
 * - 支持分页查询，每页最多12个记录
 *
 * 响应：
 * ```json
 * {
 *   "documents": [
 *     {
 *       "id": "doc_id",
 *       "title": "文档标题",
 *       "content": "文档内容",
 *       "user_id": "user_id",
 *       "folder_id": "folder_id",
 *       "created_at": "2023-01-01T00:00:00Z",
 *       "updated_at": "2023-01-01T00:00:00Z"
 *     }
 *   ],
 *   "pagination": {
 *     "currentPage": 1,
 *     "totalPages": 5,
 *     "totalRecords": 58,
 *     "hasNextPage": true,
 *     "hasPreviousPage": false,
 *     "limit": 12
 *   }
 * }
 * ```
 */
documents.get("/", async (c) => {
  // 创建 Supabase 客户端实例
  const supabase = createSupabaseClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY
  );

  // 从认证中间件设置的上下文中获取用户信息
  const user = c.get('user');

  // 获取查询参数
  const pageParam = c.req.query('page');
  const limitParam = c.req.query('limit');
  const folderIdParam = c.req.query('folder_id');

  // 设置默认值和限制
  const page = Math.max(1, parseInt(pageParam || '1') || 1); // 页码从1开始，最小为1
  const limit = Math.min(50, Math.max(1, parseInt(limitParam || '12') || 12)); // 默认12，最大50，最小1

  // 计算偏移量
  const offset = (page - 1) * limit;

  // 构建查询
  let query = supabase
    .from('documents')
    .select('*', { count: 'exact' }) // 使用 count: 'exact' 获取准确计数
    .eq('user_id', user.id);

  // 处理文件夹过滤
  if (folderIdParam === 'null' || folderIdParam === '') {
    query = query.is('folder_id', null); // 获取未分类文档
  } else if (folderIdParam) {
    // 如果指定了文件夹，验证文件夹是否存在且属于当前用户
    const { data: folder } = await supabase
      .from('folders')
      .select('id')
      .eq('id', folderIdParam)
      .eq('user_id', user.id)
      .single();

    if (!folder) {
      return c.json({ error: '文件夹不存在或无权限访问' }, 400);
    }

    query = query.eq('folder_id', folderIdParam); // 获取指定文件夹中的文档
  }
  // 如果没有指定 folder_id，获取所有文档（包括已分类和未分类）

  // 执行查询
  const { data, error, count } = await query
    .order('updated_at', { ascending: false })  // 按更新时间降序
    .range(offset, offset + limit - 1);  // 使用 range 进行分页

  // 处理数据库查询错误
  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // 确保总记录数不为null
  const totalRecordsCount = count || 0;

  // 计算分页信息
  const totalPages = Math.ceil(totalRecordsCount / limit);
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;

  // 返回文档列表和分页信息
  return c.json({
    documents: data || [],
    pagination: {
      currentPage: page,
      totalPages,
      totalRecords: totalRecordsCount,
      hasNextPage,
      hasPreviousPage,
      limit
    }
  });
});

/**
 * 获取单个文档详情路由
 *
 * 路由：GET /api/documents/:id
 *
 * 功能：
 * - 根据文档ID获取特定文档
 * - 验证文档归属权
 *
 * 响应：
 * ```json
 * {
 *   "id": "doc_id",
 *   "title": "文档标题",
 *   "content": "文档内容",
 *   "user_id": "user_id",
 *   "created_at": "2023-01-01T00:00:00Z",
 *   "updated_at": "2023-01-01T00:00:00Z"
 * }
 * ```
 */
documents.get("/:id", async (c) => {
  // 从路径参数中获取文档ID
  const id = c.req.param("id");

  // 创建 Supabase 客户端实例
  const supabase = createSupabaseClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY
  );

  // 从认证中间件设置的上下文中获取用户信息
  const user = c.get('user');

  // 查询指定ID的文档，确保只能查询当前用户的文档
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)           // 匹配文档ID
    .eq('user_id', user.id) // 确保是当前用户的文档
    .single();              // 返回单条记录

  // 处理数据库查询错误
  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // 检查文档是否存在
  if (!data) {
    return c.json({ error: 'Document not found' }, 404);
  }

  // 返回文档详情
  return c.json(data);
});

/**
 * 创建新文档路由
 *
 * 路由：POST /api/documents
 *
 * 功能：
 * - 创建新的文档记录
 * - 自动关联当前用户
 * - 支持指定文件夹
 *
 * 请求体：
 * ```json
 * {
 *   "title": "文档标题",
 *   "content": "文档内容（支持 Markdown）",
 *   "folder_id": "文件夹ID（可选）"
 * }
 * ```
 *
 * 响应：
 * ```json
 * {
 *   "id": "doc_id",
 *   "title": "文档标题",
 *   "content": "文档内容",
 *   "user_id": "user_id",
 *   "folder_id": "folder_id",
 *   "created_at": "2023-01-01T00:00:00Z",
 *   "updated_at": "2023-01-01T00:00:00Z"
 * }
 * ```
 */
documents.post("/", async (c) => {
  // 从请求体中获取文档数据
  const { title, content, folder_id } = await c.req.json();

  // 创建 Supabase 客户端实例
  const supabase = createSupabaseClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY
  );

  // 从认证中间件设置的上下文中获取用户信息
  const user = c.get('user');

  // 验证必需字段
  if (!title || title.trim() === '') {
    return c.json({ error: '文档标题不能为空' }, 400);
  }

  // 如果指定了文件夹，验证文件夹是否存在且属于当前用户
  if (folder_id) {
    const { data: folder } = await supabase
      .from('folders')
      .select('id')
      .eq('id', folder_id)
      .eq('user_id', user.id)
      .single();

    if (!folder) {
      return c.json({ error: '文件夹不存在或无权限访问' }, 400);
    }
  }

  // 插入新文档记录
  const { data, error } = await supabase
    .from('documents')
    .insert([
      {
        title: title.trim(),        // 文档标题
        content,                    // 文档内容
        folder_id: folder_id || null, // 文件夹ID（可为空）
        user_id: user.id           // 关联当前用户ID
      }
    ])
    .select();  // 返回插入后的完整记录

  // 处理数据库插入错误
  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // 返回新创建的文档信息
  return c.json(data[0]);
});

/**
 * 更新文档路由
 *
 * 路由：PUT /api/documents/:id
 *
 * 功能：
 * - 更新现有文档的标题、内容和文件夹
 * - 自动更新修改时间
 * - 验证文档归属权
 *
 * 请求体：
 * ```json
 * {
 *   "title": "更新后的标题",
 *   "content": "更新后的内容",
 *   "folder_id": "新的文件夹ID（可选）"
 * }
 * ```
 *
 * 响应：
 * ```json
 * {
 *   "id": "doc_id",
 *   "title": "更新后的标题",
 *   "content": "更新后的内容",
 *   "folder_id": "新的文件夹ID",
 *   "user_id": "user_id",
 *   "created_at": "2023-01-01T00:00:00Z",
 *   "updated_at": "2023-01-01T12:00:00Z"
 * }
 * ```
 */
documents.put("/:id", async (c) => {
  // 从路径参数中获取文档ID
  const id = c.req.param("id");

  // 从请求体中获取更新后的数据
  const { title, content, folder_id } = await c.req.json();

  // 创建 Supabase 客户端实例
  const supabase = createSupabaseClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY
  );

  // 从认证中间件设置的上下文中获取用户信息
  const user = c.get('user');

  // 验证必需字段
  if (title && title.trim() === '') {
    return c.json({ error: '文档标题不能为空' }, 400);
  }

  // 如果指定了新的文件夹，验证文件夹是否存在且属于当前用户
  if (folder_id) {
    const { data: folder } = await supabase
      .from('folders')
      .select('id')
      .eq('id', folder_id)
      .eq('user_id', user.id)
      .single();

    if (!folder) {
      return c.json({ error: '文件夹不存在或无权限访问' }, 400);
    }
  }

  // 构建更新对象
  const updateData: any = {
    updated_at: new Date().toISOString()  // 设置更新时间
  };

  if (title !== undefined) {
    updateData.title = title.trim();
  }

  if (content !== undefined) {
    updateData.content = content;
  }

  if (folder_id !== undefined) {
    updateData.folder_id = folder_id || null; // 允许设置为 null（移出文件夹）
  }

  // 更新文档记录
  const { data, error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', id)           // 匹配文档ID
    .eq('user_id', user.id) // 确保只能更新当前用户的文档
    .select();              // 返回更新后的完整记录

  // 处理数据库更新错误
  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // 检查是否有记录被更新（可能文档不存在或不属于当前用户）
  if (data.length === 0) {
    return c.json({ error: 'Document not found or unauthorized' }, 404);
  }

  // 返回更新后的文档信息
  return c.json(data[0]);
});

/**
 * 删除文档路由
 *
 * 路由：DELETE /api/documents/:id
 *
 * 功能：
 * - 删除指定ID的文档
 * - 验证文档归属权
 *
 * 响应：
 * ```json
 * {
 *   "message": "Document doc_id deleted"
 * }
 * ```
 */
documents.delete("/:id", async (c) => {
  // 从路径参数中获取文档ID
  const id = c.req.param("id");

  // 创建 Supabase 客户端实例
  const supabase = createSupabaseClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY
  );

  // 从认证中间件设置的上下文中获取用户信息
  const user = c.get('user');

  // 删除文档记录，确保只能删除当前用户的文档
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)           // 匹配文档ID
    .eq('user_id', user.id); // 确保只能删除当前用户的文档

  // 处理数据库删除错误
  if (error) {
    return c.json({ error: error.message }, 500);
  }

  // 返回删除成功消息
  return c.json({ message: `Document ${id} deleted` });
});

/**
 * 导出文档管理路由模块
 * 供主应用文件挂载使用
 */
export default documents;