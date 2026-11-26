import * as React from 'react';
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Database, Eye, EyeOff, HardDrive, Heart, LayoutGrid, List, MessageCircle, MoreVertical, PenLine, Pin, Plus, RefreshCw, Search, Shield, Sparkles, Trash2, User, X, Zap } from 'lucide-react';

import { TurnstileWidget } from '@/components/turnstile';
import { PageShell } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useConfig } from '@/hooks/use-config';
import { apiFetch, formatDate, getSecurityHeaders, type Category, type Post } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { attachFancybox, highlightCodeBlocks, renderMarkdownToHtml } from '@/lib/markdown';
import { validateText } from '@/lib/validators';

export function IndexPage() {
	const { config } = useConfig();
	const token = getToken();
	const user = React.useMemo(() => getUser(), [token]);
	const [banner, setBanner] = React.useState<string>('');
	const [categories, setCategories] = React.useState<Category[]>([]);
	const [selectedCategory, setSelectedCategory] = React.useState<string>('');
	const [searchInput, setSearchInput] = React.useState<string>('');
	const [searchQuery, setSearchQuery] = React.useState<string>('');
	const [posts, setPosts] = React.useState<Post[]>([]);
	const [totalPosts, setTotalPosts] = React.useState<number>(0);
	const [pageOffset, setPageOffset] = React.useState<number>(0);
	const [loading, setLoading] = React.useState<boolean>(true);
	const [error, setError] = React.useState<string>('');
	const pageLimit = 10;
	const [jumpTo, setJumpTo] = React.useState<string>('');

	const [newTitle, setNewTitle] = React.useState('');
	const [newContent, setNewContent] = React.useState('');
	const [newCategoryId, setNewCategoryId] = React.useState<string>('');
	const [previewOpen, setPreviewOpen] = React.useState(true);
	const [createOpen, setCreateOpen] = React.useState(false);
	const [createLoading, setCreateLoading] = React.useState(false);
	const [createError, setCreateError] = React.useState('');
	const [uploadLoading, setUploadLoading] = React.useState(false);
	const [uploadError, setUploadError] = React.useState('');

	// insert text at current cursor position in the textarea (or append)
	function insertIntoContent(insertText: string) {
		if (newContentRef.current) {
			const el = newContentRef.current;
			const start = el.selectionStart;
			const end = el.selectionEnd;
			const before = newContent.slice(0, start);
			const after = newContent.slice(end);
			const updated = before + insertText + after;
			setNewContent(updated);
			// reposition cursor immediately after inserted text
			setTimeout(() => {
				el.selectionStart = el.selectionEnd = start + insertText.length;
				el.focus();
			}, 0);
		} else {
			setNewContent(newContent + insertText);
		}
	}

	function applyEdit(transform: (text: string, start: number, end: number) => { text: string; selectionStart: number; selectionEnd: number }) {
		const el = newContentRef.current;
		const start = el ? el.selectionStart : newContent.length;
		const end = el ? el.selectionEnd : newContent.length;
		const result = transform(newContent, start, end);
		setNewContent(result.text);
		setTimeout(() => {
			const target = newContentRef.current;
			if (!target) return;
			target.selectionStart = result.selectionStart;
			target.selectionEnd = result.selectionEnd;
			target.focus();
		}, 0);
	}

	function wrapSelection(prefix: string, suffix: string, placeholder: string) {
		applyEdit((text, start, end) => {
			const selected = text.slice(start, end) || placeholder;
			const next = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
			const selectionStart = start + prefix.length;
			const selectionEnd = selectionStart + selected.length;
			return { text: next, selectionStart, selectionEnd };
		});
	}

	function wrapBlock(fence: string) {
		applyEdit((text, start, end) => {
			const selected = text.slice(start, end);
			const block = `${fence}\n${selected}\n${fence}`;
			const next = text.slice(0, start) + block + text.slice(end);
			const selectionStart = start + fence.length + 1;
			const selectionEnd = selectionStart + selected.length;
			return { text: next, selectionStart, selectionEnd };
		});
	}

	function transformLines(transform: (line: string, index: number, lines: string[]) => string) {
		applyEdit((text, start, end) => {
			const lineStart = text.lastIndexOf('\n', start - 1) + 1;
			const lineEnd = text.indexOf('\n', end);
			const endIndex = lineEnd === -1 ? text.length : lineEnd;
			const segment = text.slice(lineStart, endIndex);
			const lines = segment.split('\n');
			const nextSegment = lines.map(transform).join('\n');
			const next = text.slice(0, lineStart) + nextSegment + text.slice(endIndex);
			return { text: next, selectionStart: lineStart, selectionEnd: lineStart + nextSegment.length };
		});
	}

	function setHeading(level: number) {
		transformLines((line) => {
			const cleaned = line.replace(/^\s{0,3}#{1,6}\s+/, '');
			if (level === 0) return cleaned;
			return `${'#'.repeat(level)} ${cleaned}`;
		});
	}

	function toggleLinePrefix(prefix: string, matcher: RegExp) {
		transformLines((line) => {
			if (matcher.test(line)) return line.replace(matcher, '');
			return `${prefix}${line}`;
		});
	}

	function toggleBlockquote() {
		transformLines((line) => (line.startsWith('> ') ? line.slice(2) : `> ${line}`));
	}

	function toggleList(ordered: boolean) {
		transformLines((line, index, lines) => {
			if (ordered) {
				if (/^\d+\.\s+/.test(line)) return line.replace(/^\d+\.\s+/, '');
				return `${index + 1}. ${line}`;
			}
			if (/^[-*+]\s+/.test(line)) return line.replace(/^[-*+]\s+/, '');
			return `- ${line}`;
		});
	}

	function indentLines() {
		transformLines((line) => `  ${line}`);
	}

	function outdentLines() {
		transformLines((line) => line.replace(/^(\t| {1,2})/, ''));
	}

	function insertLink(isImage: boolean) {
		applyEdit((text, start, end) => {
			const selected = text.slice(start, end) || (isImage ? 'alt' : 'text');
			const link = isImage ? `![${selected}](url)` : `[${selected}](url)`;
			const next = text.slice(0, start) + link + text.slice(end);
			const urlStart = start + (isImage ? 2 : 1) + selected.length + 2;
			const urlEnd = urlStart + 3;
			return { text: next, selectionStart: urlStart, selectionEnd: urlEnd };
		});
	}

	function insertTable() {
		applyEdit((text, start, end) => {
			const table = `| Header | Header |\n| --- | --- |\n| Cell | Cell |`;
			const next = text.slice(0, start) + table + text.slice(end);
			const selectionStart = start + 2;
			const selectionEnd = selectionStart + 6;
			return { text: next, selectionStart, selectionEnd };
		});
	}

	function handleEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		const isMod = e.ctrlKey || e.metaKey;
		if (!isMod) return;
		const key = e.key.toLowerCase();
		const shift = e.shiftKey;
		if (!shift && key === 'b') {
			e.preventDefault();
			wrapSelection('**', '**', 'text');
			return;
		}
		if (!shift && key === 'i') {
			e.preventDefault();
			wrapSelection('*', '*', 'text');
			return;
		}
		if (!shift && key === 'u') {
			e.preventDefault();
			wrapSelection('<u>', '</u>', 'text');
			return;
		}
		if (!shift && key === 'k') {
			e.preventDefault();
			insertLink(false);
			return;
		}
		if (!shift && key === 't') {
			e.preventDefault();
			insertTable();
			return;
		}
		if (shift && key === 'i') {
			e.preventDefault();
			insertLink(true);
			return;
		}
		if (!shift && key === '0') {
			e.preventDefault();
			setHeading(0);
			return;
		}
		if (!shift && key === '1') {
			e.preventDefault();
			setHeading(1);
			return;
		}
		if (!shift && key === '2') {
			e.preventDefault();
			setHeading(2);
			return;
		}
		if (!shift && key === '3') {
			e.preventDefault();
			setHeading(3);
			return;
		}
		if (shift && key === 'k') {
			e.preventDefault();
			wrapBlock('```');
			return;
		}
		if (shift && key === 'm') {
			e.preventDefault();
			wrapBlock('$$');
			return;
		}
		if (shift && key === 'q') {
			e.preventDefault();
			toggleBlockquote();
			return;
		}
		if (shift && key === '[') {
			e.preventDefault();
			toggleList(true);
			return;
		}
		if (shift && key === ']') {
			e.preventDefault();
			toggleList(false);
			return;
		}
		if (!shift && key === '[') {
			e.preventDefault();
			outdentLines();
			return;
		}
		if (!shift && key === ']') {
			e.preventDefault();
			indentLines();
			return;
		}
		if (shift && (e.code === 'Backquote' || key === '`')) {
			e.preventDefault();
			wrapSelection('`', '`', 'code');
			return;
		}
		if (e.altKey && shift && e.code === 'Digit5') {
			e.preventDefault();
			wrapSelection('~~', '~~', 'text');
			return;
		}
	}
	const [turnstileToken, setTurnstileToken] = React.useState('');
	const [turnstileResetKey, setTurnstileResetKey] = React.useState(0);
	const previewRef = React.useRef<HTMLDivElement | null>(null);
	const newContentRef = React.useRef<HTMLTextAreaElement | null>(null);
	const [adminMenuPostId, setAdminMenuPostId] = React.useState<number | null>(null);
	const [adminActionPostId, setAdminActionPostId] = React.useState<number | null>(null);
	const [sortOption, setSortOption] = React.useState('time_desc');
	const listTopRef = React.useRef<HTMLDivElement | null>(null);
	const lastOffsetRef = React.useRef<number | null>(null);

	const enabled = !!config?.turnstile_enabled;
	const siteKey = config?.turnstile_site_key || '';
	const turnstileActive = enabled && !!siteKey;

	const fetchCategories = React.useCallback(async () => {
		try {
			const list = await apiFetch<Category[]>('/categories');
			setCategories(list);
		} catch {
			setCategories([]);
		}
	}, []);

	const fetchPosts = React.useCallback(
		async (offset: number) => {
			setLoading(true);
			setError('');
			try {
				const sortBy =
					sortOption === 'likes_desc'
						? 'likes'
						: sortOption === 'comments_desc'
							? 'comments'
							: sortOption === 'views_desc'
								? 'views'
								: 'time';
				const sortDir = sortOption === 'time_asc' ? 'asc' : 'desc';
				const categoryParam = selectedCategory ? `&category_id=${encodeURIComponent(selectedCategory)}` : '';
				const searchParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
				const sortParam = `&sort_by=${encodeURIComponent(sortBy)}&sort_dir=${encodeURIComponent(sortDir)}`;
				const res = await fetch(`/api/posts?limit=${pageLimit}&offset=${offset}${categoryParam}${searchParam}${sortParam}`);
				if (!res.ok) {
					let msg = `加载帖子失败 (${res.status})`;
					try {
						const body = await res.text();
						if (body) msg += `: ${body}`;
					} catch {}
					throw new Error(msg);
				}
				const data = (await res.json()) as any;
				const list: Post[] = Array.isArray(data) ? data : (data.posts as Post[]);
				const total = Array.isArray(data) ? list.length : Number(data.total || 0);

				const processed = list.map((p) => ({
					...p,
					like_count: p.like_count || 0,
					comment_count: p.comment_count || 0
				}));

				setPosts(processed);
				setTotalPosts(total);
				setPageOffset(offset);
			} catch (e: any) {
				setError(String(e?.message || e));
			} finally {
				setLoading(false);
			}
		},
		[selectedCategory, searchQuery, sortOption]
	);

	React.useEffect(() => {
		fetchCategories();
	}, [fetchCategories]);

	React.useEffect(() => {
		fetchPosts(0);
	}, [fetchPosts]);

	React.useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get('verified') === 'true') {
			setBanner('邮箱验证成功，现在可以登录。');
			params.delete('verified');
			window.history.replaceState({}, document.title, `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
		} else if (params.get('email_changed') === 'true') {
			setBanner('邮箱更换成功。');
			params.delete('email_changed');
			window.history.replaceState({}, document.title, `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
		}
	}, []);

	React.useEffect(() => {
		if (!previewOpen) return;
		const el = previewRef.current;
		if (!el) return;
		highlightCodeBlocks(el);
		const cleanup = attachFancybox(el);
		return cleanup;
	}, [previewOpen, newContent]);

	React.useEffect(() => {
		if (adminMenuPostId == null) return;
		function close() {
			setAdminMenuPostId(null);
		}
		document.addEventListener('mousedown', close);
		document.addEventListener('touchstart', close);
		return () => {
			document.removeEventListener('mousedown', close);
			document.removeEventListener('touchstart', close);
		};
	}, [adminMenuPostId]);

	React.useEffect(() => {
		if (lastOffsetRef.current !== null && lastOffsetRef.current !== pageOffset && !loading) {
			listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
		lastOffsetRef.current = pageOffset;
	}, [pageOffset, loading]);

	async function adminTogglePin(post: Post) {
		if (!user || user.role !== 'admin') return;
		setAdminActionPostId(post.id);
		try {
			const next = !post.is_pinned;
			await apiFetch(`/admin/posts/${post.id}/pin`, {
				method: 'POST',
				headers: getSecurityHeaders('POST'),
				body: JSON.stringify({ pinned: next })
			});
			setAdminMenuPostId(null);
			await fetchPosts(pageOffset);
		} catch {
			return;
		} finally {
			setAdminActionPostId(null);
		}
	}

	async function adminDeletePost(post: Post) {
		if (!user || user.role !== 'admin') return;
		if (!confirm('确定要删除这个帖子吗？此操作无法撤销。')) return;
		setAdminActionPostId(post.id);
		try {
			await apiFetch(`/admin/posts/${post.id}`, {
				method: 'DELETE',
				headers: getSecurityHeaders('DELETE')
			});
			setAdminMenuPostId(null);
			await fetchPosts(pageOffset);
		} catch {
			return;
		} finally {
			setAdminActionPostId(null);
		}
	}

	async function adminMovePost(post: Post, categoryId: number | null) {
		if (!user || user.role !== 'admin') return;
		setAdminActionPostId(post.id);
		try {
			await apiFetch(`/admin/posts/${post.id}/move`, {
				method: 'POST',
				headers: getSecurityHeaders('POST'),
				body: JSON.stringify({ category_id: categoryId })
			});
			setAdminMenuPostId(null);
			await fetchPosts(pageOffset);
		} catch {
			return;
		} finally {
			setAdminActionPostId(null);
		}
	}

	async function createPost(e: React.FormEvent) {
		e.preventDefault();
		if (!user) {
			window.location.href = '/login';
			return;
		}

		setCreateError('');
		const titleErr = validateText(newTitle, '标题');
		if (titleErr) return setCreateError(titleErr);
		const contentErr = validateText(newContent, '内容');
		if (contentErr) return setCreateError(contentErr);
		if (newTitle.length > 30) return setCreateError('标题过长 (最多 30 字符)');
		if (newContent.length > 3000) return setCreateError('内容过长 (最多 3000 字符)');
		if (turnstileActive && !turnstileToken) return setCreateError('请完成验证码验证');

		setCreateLoading(true);
		try {
			await apiFetch<{ success: boolean }>('/posts', {
				method: 'POST',
				headers: getSecurityHeaders('POST'),
				body: JSON.stringify({
					title: newTitle,
					content: newContent,
					category_id: newCategoryId ? Number(newCategoryId) : null,
					'cf-turnstile-response': turnstileToken
				})
			});
			setNewTitle('');
			setNewContent('');
			setNewCategoryId('');
			setTurnstileToken('');
			setTurnstileResetKey((v) => v + 1);
			setCreateOpen(false);
			await fetchPosts(0);
		} catch (e: any) {
			setCreateError(String(e?.message || e));
			setTurnstileToken('');
			setTurnstileResetKey((v) => v + 1);
		} finally {
			setCreateLoading(false);
		}
	}

	const currentPage = Math.floor(pageOffset / pageLimit) + 1;
	const totalPages = Math.max(1, Math.ceil(totalPosts / pageLimit));
	const pages: Array<number | 'ellipsis'> = [];
	if (totalPages <= 7) {
		for (let p = 1; p <= totalPages; p++) pages.push(p);
	} else {
		const start = Math.max(2, currentPage - 2);
		const end = Math.min(totalPages - 1, currentPage + 2);
		pages.push(1);
		if (start > 2) pages.push('ellipsis');
		for (let p = start; p <= end; p++) pages.push(p);
		if (end < totalPages - 1) pages.push('ellipsis');
		pages.push(totalPages);
	}

	function getCoverImageUrl(markdown: string) {
		const mdMatch = markdown.match(/!\[[^\]]*\]\(([^)\s]+)\)/i);
		const htmlMatch = markdown.match(/<img[^>]+src=["']([^"']+)["']/i);
		let url = mdMatch?.[1] || htmlMatch?.[1] || '';
		if (!url) return '';
		if (!/^https?:\/\//i.test(url) && !url.startsWith('/') && !url.startsWith('data:')) {
			url = `/r2/${url.replace(/^\/+/, '')}`;
		}
		return url;
	}

	const [viewMode, setViewMode] = React.useState<'card' | 'compact'>('card');
	const composeRef = React.useRef<HTMLDivElement | null>(null);

	function scrollToCompose() {
		if (!user) {
			window.location.href = '/login';
			return;
		}
		setCreateOpen(true);
		composeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	return (
		<PageShell>
			<div className="space-y-5">
				{banner ? <div className="rounded-xl border bg-muted/40 px-4 py-2.5 text-sm">{banner}</div> : null}

				{/* ===== Hero ===== */}
				<section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-50/45 via-card to-card p-6 sm:p-8 dark:from-indigo-950/20 dark:via-card dark:to-card">
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_78%_40%,#000,transparent_72%)]"
						style={{
							backgroundImage:
								'linear-gradient(rgba(99,102,241,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.055) 1px,transparent 1px)',
							backgroundSize: '26px 26px'
						}}
					/>
					<div className="relative grid gap-6 md:grid-cols-[1.3fr_.9fr] md:items-center">
						<div className="min-w-0">
							<span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
								社区运行中 · Cloudflare Edge
							</span>
							<h1 className="mt-4 text-[26px] font-extrabold leading-tight tracking-tight sm:text-[32px]">
								一个在
								<span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-indigo-400 dark:to-violet-400">
									边缘节点
								</span>
								上跑的论坛
							</h1>
							<p className="mt-2.5 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
								CForum 社区：技术分享、版本发布与学术讨论。请求就近命中 Workers 节点，数据落在 D1，图片存在 R2。
							</p>
							<div className="mt-5 flex flex-wrap items-center gap-2">
								<Button type="button" onClick={scrollToCompose} className="h-10 rounded-xl px-4 shadow-sm">
									<Plus className="h-4 w-4" />
									发布新帖
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={() => listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
									className="h-10 rounded-xl px-4"
								>
									浏览最新
									<ArrowRight className="h-4 w-4" />
								</Button>
							</div>
							<div className="mt-6 flex flex-wrap gap-x-7 gap-y-3">
								<div>
									<div className="text-[19px] font-bold leading-none tracking-tight">{totalPosts}</div>
									<div className="mt-1 text-[11px] tracking-wide text-muted-foreground">主题</div>
								</div>
								<div>
									<div className="text-[19px] font-bold leading-none tracking-tight">{categories.length}</div>
									<div className="mt-1 text-[11px] tracking-wide text-muted-foreground">分类</div>
								</div>
								<div>
									<div className="text-[19px] font-bold leading-none tracking-tight">
										{config?.user_count ? config.user_count : '—'}
									</div>
									<div className="mt-1 text-[11px] tracking-wide text-muted-foreground">成员</div>
								</div>
								<div>
									<div className="text-[19px] font-bold leading-none tracking-tight">{pageLimit}</div>
									<div className="mt-1 text-[11px] tracking-wide text-muted-foreground">每页条数</div>
								</div>
							</div>
						</div>

						{/* 服务状态卡（装饰性，数据来自当前配置） */}
						<div className="hidden rounded-xl border bg-card p-4 shadow-sm md:block">
							<div className="mb-3 flex items-center justify-between">
								<span className="text-xs font-semibold text-muted-foreground">服务状态</span>
								<span className="font-mono text-[10px] text-muted-foreground">edge · apac</span>
							</div>
							<div className="flex items-center gap-2 border-t border-dashed py-2 text-xs text-muted-foreground first:border-t-0">
								<Zap className="h-3.5 w-3.5 text-indigo-500" />
								<span className="w-[74px] font-medium text-foreground">Workers</span>
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
								<span>正常</span>
								<span className="ml-auto font-mono text-[11px]">edge</span>
							</div>
							<div className="flex items-center gap-2 border-t border-dashed py-2 text-xs text-muted-foreground">
								<Database className="h-3.5 w-3.5 text-indigo-500" />
								<span className="w-[74px] font-medium text-foreground">D1 数据库</span>
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
								<span>正常</span>
								<span className="ml-auto font-mono text-[11px]">forum_db</span>
							</div>
							<div className="flex items-center gap-2 border-t border-dashed py-2 text-xs text-muted-foreground">
								<HardDrive className="h-3.5 w-3.5 text-indigo-500" />
								<span className="w-[74px] font-medium text-foreground">R2 存储</span>
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
								<span>正常</span>
								<span className="ml-auto font-mono text-[11px]">images</span>
							</div>
						</div>
					</div>
				</section>

				{/* ===== 筛选栏 ===== */}
				<div className="sticky top-2 z-30 rounded-xl border bg-background/85 p-2.5 shadow-sm backdrop-blur sm:px-3">
					<div className="flex flex-wrap items-center gap-2">
						<div className="flex min-w-0 flex-1 basis-[240px] items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							<FilterChip active={selectedCategory === ''} onClick={() => { setSelectedCategory(''); setPageOffset(0); }}>
								全部
							</FilterChip>
							<FilterChip active={selectedCategory === 'uncategorized'} onClick={() => { setSelectedCategory('uncategorized'); setPageOffset(0); }}>
								未分类
							</FilterChip>
							{categories.map((c) => (
								<FilterChip
									key={c.id}
									active={selectedCategory === String(c.id)}
									onClick={() => { setSelectedCategory(String(c.id)); setPageOffset(0); }}
								>
									{c.name}
								</FilterChip>
							))}
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<div className="relative flex items-center">
								<select
									id="sort-filter"
									aria-label="排序"
									className="h-8 appearance-none rounded-lg border bg-background pl-2.5 pr-7 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
									value={sortOption}
									onChange={(e) => {
										setSortOption(e.target.value);
										setPageOffset(0);
									}}
								>
									<option value="time_desc">最新发布</option>
									<option value="time_asc">最早发布</option>
									<option value="likes_desc">最多点赞</option>
									<option value="comments_desc">最多评论</option>
									<option value="views_desc">最多观看</option>
								</select>
								<ChevronDown className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 text-muted-foreground" />
							</div>

							<form
								className="flex h-8 items-center gap-1 rounded-lg border bg-background pl-2.5 pr-1 focus-within:ring-2 focus-within:ring-ring"
								onSubmit={(e) => {
									e.preventDefault();
									setPageOffset(0);
									setSearchQuery(searchInput.trim());
								}}
							>
								<Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
								<input
									value={searchInput}
									onChange={(e) => setSearchInput(e.target.value)}
									placeholder="搜索标题 / 内容"
									className="h-7 w-28 bg-transparent text-xs outline-none placeholder:text-muted-foreground sm:w-32"
								/>
								{searchInput || searchQuery ? (
									<button
										type="button"
										className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
										onClick={() => {
											setSearchInput('');
											setSearchQuery('');
											setPageOffset(0);
										}}
									>
										<X className="h-3.5 w-3.5" />
										<span className="sr-only">清除搜索</span>
									</button>
								) : null}
								<button
									type="submit"
									disabled={loading}
									className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
								>
									<ArrowRight className="h-3.5 w-3.5" />
									<span className="sr-only">搜索</span>
								</button>
							</form>

							<button
								type="button"
								onClick={() => fetchPosts(pageOffset)}
								disabled={loading}
								className="grid h-8 w-8 place-items-center rounded-lg border bg-background text-muted-foreground transition hover:text-foreground disabled:opacity-50"
							>
								<RefreshCw className="h-3.5 w-3.5" />
								<span className="sr-only">刷新</span>
							</button>

							<div className="hidden overflow-hidden rounded-lg border bg-background sm:flex">
								<button
									type="button"
									onClick={() => setViewMode('card')}
									className={`grid h-8 w-8 place-items-center ${viewMode === 'card' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'}`}
								>
									<LayoutGrid className="h-3.5 w-3.5" />
									<span className="sr-only">卡片视图</span>
								</button>
								<button
									type="button"
									onClick={() => setViewMode('compact')}
									className={`grid h-8 w-8 place-items-center ${viewMode === 'compact' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'}`}
								>
									<List className="h-3.5 w-3.5" />
									<span className="sr-only">紧凑视图</span>
								</button>
							</div>
						</div>
					</div>
				</div>

				{/* ===== 主体：帖子流 + 侧栏 ===== */}
				<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_288px] lg:items-start">
					<div id="feed" className="min-w-0 scroll-mt-28 space-y-4">
						{user ? (
							<div ref={composeRef} className="overflow-hidden rounded-2xl border bg-card">
								<button
									type="button"
									onClick={() => setCreateOpen((v) => !v)}
									className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted/40"
								>
									<span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
										<PenLine className="h-4 w-4" />
									</span>
									<span className="min-w-0 flex-1">
										<span className="block text-sm font-semibold">发布新帖</span>
										<span className="block text-xs text-muted-foreground">支持 Markdown、图片上传与实时预览</span>
									</span>
									{createOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
								</button>

								{createOpen ? (
									<form className="space-y-4 border-t px-4 py-4" onSubmit={createPost}>
										{createError ? (
											<div className="rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">{createError}</div>
										) : null}
										<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
											<div className="space-y-1.5">
												<Label htmlFor="new-title" className="text-xs text-muted-foreground">标题</Label>
												<Input id="new-title" maxLength={30} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
											</div>
											<div className="space-y-1.5">
												<Label htmlFor="new-category" className="text-xs text-muted-foreground">分类（可选）</Label>
												<select
													id="new-category"
													className="h-9 w-full rounded-md border bg-background px-3 text-sm"
													value={newCategoryId}
													onChange={(e) => setNewCategoryId(e.target.value)}
												>
													<option value="">无分类</option>
													{categories.map((c) => (
														<option key={c.id} value={String(c.id)}>
															{c.name}
														</option>
													))}
												</select>
											</div>
										</div>

										<div className="space-y-2">
											<div className="flex flex-wrap items-center justify-between gap-2">
												<Label htmlFor="new-content" className="text-xs text-muted-foreground">内容（支持 Markdown）</Label>
												<div className="flex items-center gap-2">
													<span className="hidden text-[11px] text-muted-foreground sm:inline">
														Ctrl+1/2/3、Ctrl+B/I/U、Ctrl+K、Ctrl+Shift+K
													</span>
													<Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen((v) => !v)}>
														{previewOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
														<span className="sr-only">{previewOpen ? '关闭预览' : '打开预览'}</span>
													</Button>
												</div>
											</div>
											<div className={previewOpen ? 'grid gap-3 lg:grid-cols-2' : 'space-y-2'}>
												<div className="space-y-2">
													<Textarea
														id="new-content"
														ref={newContentRef}
														value={newContent}
														onChange={(e) => setNewContent(e.target.value)}
														onKeyDown={handleEditorKeyDown}
														rows={10}
														className="min-h-[220px]"
														required
													/>
													<div className="text-[11px] text-muted-foreground">
														Ctrl+T 表格，Ctrl+Shift+M 公式，Ctrl+Shift+Q 引用，Alt+Shift+5 删除线
													</div>
												</div>
												{previewOpen ? (
													<div className="rounded-lg border bg-muted/20 p-3">
														<div className="mb-2 text-[11px] font-medium text-muted-foreground">预览</div>
														<div
															ref={previewRef}
															className="prose max-w-none break-words [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1"
															dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(newContent || '') }}
														/>
													</div>
												) : null}
											</div>
										</div>

										<div className="space-y-1.5">
											<label className="block text-xs text-muted-foreground">上传图片</label>
											<input
												type="file"
												accept="image/*"
												className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1.5 file:text-xs file:text-foreground hover:file:bg-muted"
												onChange={async (e) => {
													const file = e.target.files && e.target.files[0];
													if (!file) return;
													setUploadError('');
													if (file.size > 2 * 1024 * 1024) {
														setUploadError('文件过大 (最大 2MB)');
														return;
													}
													setUploadLoading(true);
													try {
														const formData = new FormData();
														formData.append('file', file);
														formData.append('type', 'post');
														const res = await fetch('/api/upload', {
															method: 'POST',
															headers: getSecurityHeaders('POST', null),
															body: formData
														});
														const data = await res.json();
														if (!res.ok) throw new Error(data?.error || '上传失败');
														insertIntoContent(`

![](${data.url})

`);
														setPreviewOpen(true);
													} catch (err: any) {
														setUploadError(String(err?.message || err));
													} finally {
														setUploadLoading(false);
													}
												}}
											/>
											{uploadError ? <div className="text-xs text-destructive">{uploadError}</div> : null}
											{uploadLoading ? <div className="text-xs text-muted-foreground">上传中…</div> : null}
										</div>

										<TurnstileWidget enabled={turnstileActive} siteKey={siteKey} onToken={setTurnstileToken} resetKey={turnstileResetKey} />

										<div className="flex items-center justify-between gap-3">
											<span className="text-[11px] text-muted-foreground">发布前请遵守社区规范</span>
											<Button type="submit" disabled={createLoading} className="h-9 rounded-lg px-5">
												{createLoading ? '发布中…' : '发布'}
											</Button>
										</div>
									</form>
								) : null}
							</div>
						) : (
							<div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3.5">
								<Sparkles className="h-4 w-4 text-indigo-500" />
								<span className="text-sm text-muted-foreground">
									<a className="font-medium text-foreground underline underline-offset-2" href="/login">
										登录
									</a>
									后可发布、点赞和评论。
								</span>
								<Button asChild variant="outline" size="sm" className="ml-auto">
									<a href="/register">注册账号</a>
								</Button>
							</div>
						)}

						{error ? (
							<div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</div>
						) : null}

						<div ref={listTopRef} className="scroll-mt-40" />

						{loading ? (
							<div className="space-y-3">
								{[0, 1, 2].map((i) => (
									<div key={i} className="animate-pulse rounded-2xl border bg-card p-4">
										<div className="h-4 w-2/5 rounded bg-muted" />
										<div className="mt-3 h-3 w-4/5 rounded bg-muted/70" />
										<div className="mt-3 h-3 w-1/3 rounded bg-muted/50" />
									</div>
								))}
							</div>
						) : posts.length === 0 ? (
							<div className="rounded-2xl border border-dashed bg-card/60 px-6 py-14 text-center">
								<div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-indigo-500/10 text-indigo-500">
									<Search className="h-5 w-5" />
								</div>
								<div className="mt-3 text-sm font-medium">这里还没有内容</div>
								<div className="mt-1 text-xs text-muted-foreground">
									{searchQuery ? '换个关键词试试，或清空筛选条件。' : '成为第一个发帖的人吧。'}
								</div>
								<div className="mt-4 flex justify-center gap-2">
									{searchQuery ? (
										<Button
											variant="outline"
											size="sm"
											onClick={() => {
												setSearchInput('');
												setSearchQuery('');
												setPageOffset(0);
											}}
										>
											清空搜索
										</Button>
									) : null}
									<Button size="sm" onClick={scrollToCompose}>
										<Plus className="h-4 w-4" />
										发布新帖
									</Button>
								</div>
							</div>
						) : (
							<div className="space-y-2.5">
								{posts.map((p) => {
									const coverUrl = getCoverImageUrl(p.content || '');
									const excerpt = getExcerpt(p.content || '');
									const isAdmin = user?.role === 'admin';
									const menuOpen = adminMenuPostId === p.id;
									const actionLoading = adminActionPostId === p.id;
									const compact = viewMode === 'compact';
									return (
										<article
											key={p.id}
											className={`group relative overflow-hidden rounded-2xl border bg-card transition duration-200 hover:-translate-y-px hover:border-indigo-500/25 hover:shadow-lg ${
												p.is_pinned ? 'border-amber-500/30' : ''
											}`}
										>
											<span
												className={`pointer-events-none absolute bottom-4 left-0 top-4 w-[3px] rounded-r bg-gradient-to-b transition-opacity ${
													p.is_pinned
														? 'from-amber-500 to-orange-500 opacity-100'
														: 'from-indigo-500 to-violet-500 opacity-0 group-hover:opacity-100'
												}`}
											/>
											<div className={`flex gap-4 ${compact ? 'px-3.5 py-3' : 'px-4 py-4 sm:px-5'}`}>
												{coverUrl && !compact ? (
													<a
														href={`/posts/${p.id}`}
														className="hidden h-[88px] w-[132px] shrink-0 overflow-hidden rounded-xl border bg-muted/30 sm:block"
													>
														<img
															src={coverUrl}
															alt=""
															className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
															loading="lazy"
															referrerPolicy="no-referrer"
														/>
													</a>
												) : null}

												<div className="min-w-0 flex-1">
													<div className="flex items-start gap-2">
														{p.is_pinned ? (
															<span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
																<Pin className="h-3 w-3" />
																置顶
															</span>
														) : null}
														<a
															href={`/posts/${p.id}`}
															className={`min-w-0 font-semibold tracking-tight transition-colors hover:text-indigo-600 dark:hover:text-indigo-400 ${
																compact ? 'line-clamp-1 text-[15px]' : 'line-clamp-2 text-[16px] leading-snug sm:text-[16.5px]'
															}`}
														>
															{p.title}
														</a>

														{isAdmin ? (
															<div className="relative ml-auto shrink-0">
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	disabled={actionLoading}
																	className="h-7 w-7 rounded-md p-0 text-muted-foreground"
																	onMouseDown={(e) => e.stopPropagation()}
																	onTouchStart={(e) => e.stopPropagation()}
																	onClick={(e) => {
																		e.preventDefault();
																		e.stopPropagation();
																		setAdminMenuPostId((cur) => (cur === p.id ? null : p.id));
																	}}
																	aria-haspopup="menu"
																	aria-expanded={menuOpen}
																>
																	<MoreVertical className="h-4 w-4" />
																	<span className="sr-only">更多</span>
																</Button>
																{menuOpen ? (
																	<div
																		className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border bg-background p-1 shadow-md"
																		onMouseDown={(e) => e.stopPropagation()}
																		onTouchStart={(e) => e.stopPropagation()}
																		onClick={(e) => e.stopPropagation()}
																	>
																		<button
																			type="button"
																			disabled={actionLoading}
																			className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
																			onClick={() => void adminTogglePin(p)}
																		>
																			<Pin className="h-4 w-4" />
																			{p.is_pinned ? '取消置顶' : '置顶'}
																		</button>
																		<button
																			type="button"
																			disabled={actionLoading}
																			className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
																			onClick={() => void adminDeletePost(p)}
																		>
																			<Trash2 className="h-4 w-4" />
																			删除
																		</button>
																		<div className="my-1 h-px bg-border" />
																		<div className="px-2 py-1 text-xs font-medium text-muted-foreground">移动到分类</div>
																		<button
																			type="button"
																			disabled={actionLoading}
																			className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
																			onClick={() => void adminMovePost(p, null)}
																		>
																			未分类
																		</button>
																		{categories.map((c) => (
																			<button
																				key={c.id}
																				type="button"
																				disabled={actionLoading}
																				className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
																				onClick={() => void adminMovePost(p, c.id)}
																			>
																				{c.name}
																			</button>
																		))}
																	</div>
																) : null}
															</div>
														) : null}
													</div>

													{!compact && excerpt ? (
														<p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{excerpt}</p>
													) : null}

													<div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
														<span className="inline-flex min-w-0 items-center gap-1.5">
															{p.author_avatar ? (
																<img
																	src={p.author_avatar}
																	alt=""
																	className="h-5 w-5 rounded-full object-cover"
																	loading="lazy"
																	referrerPolicy="no-referrer"
																/>
															) : (
																<span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-indigo-400/80 to-violet-400/80 text-[9px] font-semibold text-white">
																	{(p.author_name || '?').slice(0, 1).toUpperCase()}
																</span>
															)}
															<span className="truncate text-[12.5px] font-medium text-foreground">{p.author_name}</span>
															{p.author_role === 'admin' ? (
																<span className="inline-flex items-center gap-0.5 rounded border border-indigo-500/25 bg-indigo-500/10 px-1 py-0.5 text-[9px] font-semibold text-indigo-700 dark:text-indigo-300">
																	<Shield className="h-2.5 w-2.5" />
																</span>
															) : null}
														</span>
														{p.category_name ? (
															<>
																<span className="text-border">·</span>
																<span className="inline-flex items-center rounded-md border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
																	{p.category_name}
																</span>
															</>
														) : null}
														<span className="text-border">·</span>
														<time className="whitespace-nowrap" title={formatDate(p.created_at)}>
															{timeAgo(p.created_at)}
														</time>

														<div className="flex items-center gap-3 sm:ml-auto">
															<span className="inline-flex items-center gap-1 text-rose-500/90">
																<Heart className="h-3.5 w-3.5" />
																{formatCount(p.like_count)}
															</span>
															<span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
																<MessageCircle className="h-3.5 w-3.5" />
																{formatCount(p.comment_count)}
															</span>
															<span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
																<Eye className="h-3.5 w-3.5" />
																{formatCount(p.view_count)}
															</span>
														</div>
													</div>
												</div>
											</div>
										</article>
									);
								})}
							</div>
						)}

						{/* ===== 分页 ===== */}
						<div className="flex flex-wrap items-center gap-2.5 pt-1">
							<Button
								variant="outline"
								size="sm"
								disabled={currentPage <= 1 || loading}
								onClick={() => fetchPosts(Math.max(0, pageOffset - pageLimit))}
								className="h-8 gap-1 rounded-lg px-3 text-xs"
							>
								<ChevronLeft className="h-3.5 w-3.5" />
								上一页
							</Button>
							<div className="flex items-center gap-1">
								{pages.map((p, idx) =>
									p === 'ellipsis' ? (
										<span key={`e-${idx}`} className="px-1 text-xs text-muted-foreground">
											…
										</span>
									) : (
										<button
											key={p}
											disabled={loading}
											onClick={() => fetchPosts((p - 1) * pageLimit)}
											className={`grid h-8 min-w-8 place-items-center rounded-lg border px-2 text-xs transition disabled:opacity-50 ${
												p === currentPage
													? 'border-transparent bg-gradient-to-br from-indigo-500 to-violet-500 font-semibold text-white'
													: 'bg-background text-muted-foreground hover:text-foreground'
											}`}
										>
											{p}
										</button>
									)
								)}
							</div>
							<Button
								variant="outline"
								size="sm"
								disabled={currentPage >= totalPages || loading}
								onClick={() => fetchPosts(pageOffset + pageLimit)}
								className="h-8 gap-1 rounded-lg px-3 text-xs"
							>
								下一页
								<ChevronRight className="h-3.5 w-3.5" />
							</Button>

							<form
								className="ml-auto flex items-center gap-2"
								onSubmit={(e) => {
									e.preventDefault();
									const parsed = Number.parseInt(jumpTo, 10);
									if (!Number.isFinite(parsed)) return;
									const next = Math.min(Math.max(parsed, 1), totalPages);
									setJumpTo(String(next));
									fetchPosts((next - 1) * pageLimit);
								}}
							>
								<span className="text-xs text-muted-foreground">
									第 {currentPage} / {totalPages} 页
								</span>
								<Input
									value={jumpTo}
									onChange={(e) => setJumpTo(e.target.value)}
									inputMode="numeric"
									placeholder="跳页"
									className="h-8 w-16 text-center text-xs"
								/>
								<Button variant="outline" size="sm" type="submit" disabled={loading} className="h-8 rounded-lg px-3 text-xs">
									跳转
								</Button>
							</form>
						</div>
					</div>

					{/* ===== 侧栏 ===== */}
					<aside className="space-y-3 lg:sticky lg:top-4">
						<div className="rounded-xl border bg-card p-3.5">
							<h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
								<span className="h-3 w-[3px] rounded bg-gradient-to-b from-indigo-500 to-violet-500" />
								开始分享
							</h4>
							{user ? (
								<button
									type="button"
									onClick={scrollToCompose}
									className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-left text-xs text-muted-foreground transition hover:border-indigo-500/30 hover:bg-indigo-500/5 hover:text-foreground"
								>
									<PenLine className="h-3.5 w-3.5" />
									说说你的想法…
								</button>
							) : (
								<a
									href="/login"
									className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground transition hover:border-indigo-500/30 hover:bg-indigo-500/5 hover:text-foreground"
								>
									<User className="h-3.5 w-3.5" />
									登录后参与讨论
								</a>
							)}
						</div>

						<div id="boards" className="rounded-xl border bg-card p-3.5 scroll-mt-28">
							<h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
								<span className="h-3 w-[3px] rounded bg-gradient-to-b from-indigo-500 to-violet-500" />
								版块导航
							</h4>
							<button
								type="button"
								onClick={() => {
									setSelectedCategory('');
									setPageOffset(0);
								}}
								className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition hover:bg-indigo-500/5 ${
									selectedCategory === '' ? 'font-medium text-foreground' : 'text-muted-foreground'
								}`}
							>
								<span className="h-2 w-2 rounded-sm bg-indigo-500" />
								全部主题
								<span className="ml-auto font-mono text-[11px] text-muted-foreground">{totalPosts}</span>
							</button>
							{categories.map((c, i) => (
								<button
									key={c.id}
									type="button"
									onClick={() => {
										setSelectedCategory(String(c.id));
										setPageOffset(0);
									}}
									className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition hover:bg-indigo-500/5 ${
										selectedCategory === String(c.id) ? 'font-medium text-foreground' : 'text-muted-foreground'
									}`}
								>
									<span className={`h-2 w-2 rounded-sm ${CATEGORY_DOTS[i % CATEGORY_DOTS.length]}`} />
									<span className="truncate">{c.name}</span>
								</button>
							))}
						</div>

						<div className="rounded-xl border bg-card p-3.5">
							<h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
								<span className="h-3 w-[3px] rounded bg-gradient-to-b from-indigo-500 to-violet-500" />
								关于本站
							</h4>
							<p className="text-[12px] leading-relaxed text-muted-foreground">
								由 <span className="font-medium text-foreground">Cloudflare Workers · Pages</span> 提供服务，帖子数据存储于{' '}
								<span className="font-medium text-foreground">D1</span>，图片存放于{' '}
								<span className="font-medium text-foreground">R2</span>。全站运行在边缘节点上。
							</p>
						</div>
					</aside>
				</div>
			</div>
		</PageShell>
	);
}

const CATEGORY_DOTS = ['bg-amber-500', 'bg-indigo-500', 'bg-emerald-500', 'bg-sky-500', 'bg-rose-500', 'bg-violet-500'];

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition ${
				active
					? 'border-transparent bg-gradient-to-br from-indigo-500 to-violet-500 font-medium text-white shadow-sm'
					: 'bg-background text-muted-foreground hover:border-indigo-500/25 hover:text-foreground'
			}`}
		>
			{children}
		</button>
	);
}

function getExcerpt(markdown: string, limit = 110) {
	if (!markdown) return '';
	let text = markdown
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\$\$[\s\S]*?\$\$/g, ' ')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/[*_~`>|]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (text.length > limit) text = `${text.slice(0, limit)}…`;
	return text;
}

function timeAgo(input: string | null | undefined) {
	if (!input) return '';
	const date = new Date(input.endsWith('Z') ? input : `${input}Z`);
	const diff = (Date.now() - date.getTime()) / 1000;
	if (!Number.isFinite(diff) || diff < 0) return formatDate(input);
	if (diff < 60) return '刚刚';
	if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
	if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
	if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
	return formatDate(input);
}

function formatCount(n?: number) {
	const v = n || 0;
	if (v >= 10000) return `${(v / 10000).toFixed(1)}w`;
	if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
	return String(v);
}
//（注：内容由AI生成）
