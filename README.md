# mseok.log

이민석의 개발 블로그 — https://leeminseok11.github.io

GitHub Pages + Jekyll(커스텀 테마, 외부 테마 의존 없음)로 빌드됩니다. `master` 브랜치에 푸시하면 1~2분 뒤 자동 반영됩니다.

## 구조

```
_config.yml        사이트 설정 (제목, 소개, 플러그인)
_data/
  nav.yml          상단 메뉴
  categories.yml   글 카테고리 (이름 · 설명)
  stack.yml        소개 페이지 기술 스택
_layouts/          default · post · project · page
_includes/         head · header · footer · post-item · project-card · search
_posts/            글 (YYYY-MM-DD-slug.md)
_projects/         프로젝트 상세 (slug.md)
assets/            css · js · img · video
index.html         홈
posts.html         글 목록 (/posts/)
projects.html      프로젝트 목록 + 필터 (/projects/)
tags.html          태그 (/tags/)
about.html         소개 (/about/)
portfolio/         이전 한 장짜리 포트폴리오 (그대로 보존, /portfolio/)
search.json        검색 색인 (Ctrl+K)
```

## 글 쓰기

`_posts/2026-10-12-my-post.md` 파일을 만들고 아래 front matter 로 시작합니다.

```yaml
---
title: 글 제목
date: 2026-10-12 10:00:00 +0900
category: 트러블슈팅        # _data/categories.yml 의 이름 중 하나
tags: [Docker, Nginx]
project: sobi               # (선택) _projects/*.md 의 slug — 글과 프로젝트가 서로 연결됩니다
description: 목록과 검색에 보이는 한 줄 요약
---
본문은 마크다운(GFM)으로 씁니다. 코드 블록은 ```python 처럼 언어를 적으면 하이라이트됩니다.
```

본문에서 쓸 수 있는 보조 블록:

```html
<div class="warn">원인을 적는 상자 (ROOT CAUSE)</div>
<div class="tip">배운 점 상자 (LESSON)</div>
<div class="note">참고 상자 (NOTE)</div>
```

## 프로젝트 추가

`_projects/slug.md` 를 만들고 `title, slug, order, group, period, team, role, summary, thumbnail, domains, tech, repo` 를 채웁니다. `domains`·`tech` 값은 프로젝트 페이지의 필터 칩으로 자동 수집됩니다.

## 로컬 미리보기 (선택)

```bash
bundle install
bundle exec jekyll serve
# http://localhost:4000
```
