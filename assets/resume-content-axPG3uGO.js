var e=[{title:`Paradigm Study`,role:`Software Engineer · San Francisco, CA`,when:`Aug 2026 – Sep 2026`,points:[`Shipped personalized onboarding, cross-session lesson-answer persistence, and an adaptation feedback loop.`,`Built an append-only learner-event ledger in Neon PostgreSQL with server-side grading and a transactional outbox.`,`Iterated on UI/UX fixes for the canvas-based learning system; added prefetching and reduced the bundle by 258 KB.`]},{title:`Jaco Oil`,role:`Software Development Intern · Bakersfield, CA`,when:`Jun 2024 – Dec 2025`,points:[`Built Python/Pandas pipelines for fuel-monitor and point-of-sale data across 50+ sites; automated reporting and anomaly detection to replace manual operational workflows.`]}],t=[{title:`CPH2H`,role:`Head-to-Head Coding Platform`,when:`2026`,href:`https://cph2h.com`,house:`cph2h`,points:[`Built and launched cph2h.com during Rice Residency, combining live 1v1 Codeforces matches, voice/video chat, and Elo ratings in a competitive-programming platform.`,`Secured $500 in sponsorship from FR8 (fr8.so) for the platform’s launch tournament.`]},{title:`Waifu Focus`,role:`Productivity Chrome Extension`,when:`Mar 2024 – Apr 2025`,href:`https://chromewebstore.google.com/detail/waifu-focus/oilebkjfhbkbmablbmhellicongmgbml`,house:`waifu-focus`,points:[`Built and launched a website-blocking Chrome extension with custom schedules and themes; reached 1,900+ installs and a 4.8/5.0 Chrome Web Store rating.`]},{title:`@ctang.md`,role:`Short-Form Video Creator, Instagram`,when:`2026`,href:`https://www.instagram.com/ctang.md`,points:[`Write, film, and edit short-form videos; top-performing post reached 200k+ views and 12k+ likes.`,`Iterate on hooks, pacing, and formats using per-post retention and engagement data.`]},{title:`TreesWantSwag`,role:`Stanford Class of 2030 Petition Site`,when:`2026`,href:`https://treeswantswag.web.app/`,points:[`Built a React/Firebase petition site with Google sign-in; secured 180+ signatures in 48 hours through direct outreach.`]}],n=[{title:`Bakersfield Robotics`,role:`Founder · Bakersfield, CA`,when:`Jan 2023 – May 2026`,house:`robotics`,points:[`Founded a 501(c)(3) nonprofit providing free robotics education to 100+ K–8 students across three local schools.`,`Secured a local Cal State grant to fund teaching resources and classroom space.`]},{title:`VEX Team 11475B`,role:`Captain`,when:`Aug 2023 – Apr 2026`,points:[`Captained a six-member team through 10+ competitions, qualifying twice for the World Championship and earning three Excellence Awards.`]},{title:`Paradigm YC Reject Camp`,role:`Participant`,when:`2026`,points:[`Participated in Paradigm’s eight-person filmed startup camp, featuring a 24-hour build-and-pitch challenge.`]}],r=e=>`
  <article class="resume-entry">
    <div class="resume-entry-head">
      <h4>${e.href?`<a href="${e.href}">${e.title}</a>`:e.title}</h4>
      <span class="resume-when">${e.when}</span>
    </div>
    ${e.role?`<p class="resume-role">${e.role}</p>`:``}
    <ul>${e.points.map(e=>`<li>${e}</li>`).join(``)}</ul>
    ${e.house?`<button class="resume-goto" type="button" data-goto="${e.house}" aria-label="See it in the house: ${e.title}">See it in the house <span aria-hidden="true">→</span></button>`:``}
  </article>`,i=(e,t)=>`
  <section>
    <h3>${e}</h3>
    ${t.map(r).join(``)}
  </section>`;function a(){let r=[...`ude.drofnats@csgnat`].reverse().join(``);return`
  <header class="resume-head">
    <h2>Christopher Tang</h2>
    <p>Stanford University · Undergraduate, intended Mathematics &amp; Philosophy · Fall 2026 – present</p>
    <p class="resume-contact">
      <a href="mailto:${r}">${r}</a>
      <a href="https://github.com/C0derTang">GitHub</a>
      <a href="https://www.linkedin.com/in/christophertangwastaken/">LinkedIn</a>
      <a href="https://www.instagram.com/ctang.md">Instagram</a>
    </p>
  </header>
  ${i(`Experience`,e)}
  ${i(`Projects`,t)}
  ${i(`Leadership &amp; Programs`,n)}
  <section>
    <h3>Distinctions</h3>
    <ul class="resume-list">
      <li>Stockdale High School valedictorian, rank 1/582 (Class of 2026)</li>
      <li>National Science Bowl, top 16 nationally (2025)</li>
      <li>USACO Silver</li>
      <li>TEDx speaker (2025)</li>
    </ul>
    <p class="resume-skills"><strong>Technical:</strong> Competitive Swim, tetr.io, Talking to Agents, Stress-eating.</p>
  </section>`}export{a as resumeHtml};