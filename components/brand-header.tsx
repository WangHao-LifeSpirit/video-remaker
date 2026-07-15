import Image from "next/image";
import Link from "next/link";

export function BrandHeader() {
  return (
    <header className="brand-header">
      <div className="brand-header__inner">
        <Link className="brand-lockup" href="/" aria-label="返回 Video Remaker 首页">
          <Image
            alt="创生纪 SHENG LING"
            className="brand-lockup__mark"
            height={56}
            priority
            src="/brand/sheng-ling.jpg"
            width={105}
          />
          <span className="brand-lockup__text">
            <strong>Video Remaker</strong>
            <small>创生纪 · 本地视频工作台</small>
          </span>
        </Link>

        <nav className="brand-nav" aria-label="主导航">
          <Link href="/">工作台</Link>
          <Link href="/docs">说明书</Link>
          <Link href="/settings">模型设置</Link>
          <a href="https://arthurwanghouse.com" rel="noreferrer" target="_blank">
            个人网站
          </a>
          <span className="brand-contact">微信 LifeSpirit_One</span>
        </nav>
      </div>
    </header>
  );
}
