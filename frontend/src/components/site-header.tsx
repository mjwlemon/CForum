import * as React from 'react';

import { Button } from '@/components/ui/button';
import { getUser, logout, type User } from '@/lib/auth';
import { getTheme, toggleTheme, type Theme } from '@/lib/theme';
import { LogIn, LogOut, Moon, Settings, Shield, Sun, UserPlus } from 'lucide-react';

export function SiteHeader({
	currentUser,
	onLogout
}: {
	currentUser: User | null;
	onLogout?: () => void;
}) {
	const user = currentUser ?? getUser();
	const [theme, setTheme] = React.useState<Theme>(() => getTheme());

	React.useEffect(() => {
		function onThemeChange(e: Event) {
			const next = (e as CustomEvent).detail;
			if (next === 'light' || next === 'dark') setTheme(next);
		}
		window.addEventListener('theme-change', onThemeChange as any);
		setTheme(getTheme());
		return () => window.removeEventListener('theme-change', onThemeChange as any);
	}, []);

	return (
		<header className="sticky top-0 z-40 w-full border-b bg-background">
			<div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-3 sm:gap-4 sm:px-4">
				{/* 品牌 */}
				<a href="/" className="flex shrink-0 items-center gap-2.5">
					<span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-[17px] font-extrabold tracking-tight text-white shadow-sm">
						C
					</span>
					<span className="text-[17px] font-bold tracking-tight">CForum</span>
					<span className="hidden rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 sm:inline-flex dark:text-indigo-300">
						serverless
					</span>
				</a>

				{/* 导航（窄屏隐藏，避免与操作区抢空间） */}
				<nav className="ml-2 hidden items-center gap-1 md:flex">
					<a
						href="/"
						className="rounded-lg bg-indigo-500/10 px-3 py-1.5 text-[13px] font-medium text-foreground"
					>
						首页
					</a>
					<a href="/#feed" className="rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition hover:bg-muted/60 hover:text-foreground">
						全部主题
					</a>
					<a href="/#boards" className="rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition hover:bg-muted/60 hover:text-foreground">
						版块
					</a>
				</nav>

				<div className="ml-auto flex items-center gap-1.5 sm:gap-2">
					<Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-muted-foreground" onClick={toggleTheme}>
						{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
						<span className="sr-only">切换主题</span>
					</Button>

					{user ? (
						<>
							<a
								href="/settings"
								className="flex items-center gap-2 rounded-full border bg-card px-1.5 py-1 transition hover:border-indigo-500/30 sm:pl-1.5 sm:pr-2.5"
							>
								{user.avatar_url ? (
									<img
										src={user.avatar_url}
										alt=""
										className="h-7 w-7 rounded-full object-cover"
										loading="lazy"
										referrerPolicy="no-referrer"
									/>
								) : (
									<span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-fuchsia-400 to-violet-400 text-[11px] font-bold text-white">
										{(user.username || '?').slice(0, 1).toUpperCase()}
									</span>
								)}
								<span className="hidden text-[13px] font-medium sm:inline">{user.username}</span>
								{user.role === 'admin' ? (
									<span className="hidden items-center gap-1 rounded-md border border-indigo-500/25 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 sm:inline-flex dark:text-indigo-300">
										<Shield className="h-3 w-3" />
										管理员
									</span>
								) : null}
							</a>

							{user.role === 'admin' ? (
								<Button asChild variant="ghost" size="icon" className="hidden h-9 w-9 rounded-lg text-muted-foreground sm:inline-flex">
									<a href="/admin">
										<Shield className="h-4 w-4" />
										<span className="sr-only">管理后台</span>
									</a>
								</Button>
							) : null}

							<Button asChild variant="ghost" size="icon" className="hidden h-9 w-9 rounded-lg text-muted-foreground sm:inline-flex">
								<a href="/settings">
									<Settings className="h-4 w-4" />
									<span className="sr-only">设置</span>
								</a>
							</Button>

							<Button
								size="icon"
								className="h-9 w-9 rounded-lg bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-sm hover:from-rose-500 hover:to-rose-700"
								onClick={() => {
									logout();
									onLogout?.();
									window.location.href = '/';
								}}
							>
								<LogOut className="h-4 w-4" />
								<span className="sr-only">退出</span>
							</Button>
						</>
					) : (
						<>
							<Button asChild variant="ghost" size="sm" className="h-9 rounded-lg px-3">
								<a href="/login">
									<LogIn className="h-4 w-4" />
									<span>登录</span>
								</a>
							</Button>
							<Button asChild size="sm" className="h-9 rounded-lg px-3">
								<a href="/register">
									<UserPlus className="h-4 w-4" />
									<span>注册</span>
								</a>
							</Button>
						</>
					)}
				</div>
			</div>
		</header>
	);
}
//（注：内容由AI生成）
