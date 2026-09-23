from pathlib import Path

def replace(path, old, new):
    p = Path(path)
    text = p.read_text()
    assert text.count(old) == 1, (path, old, text.count(old))
    p.write_text(text.replace(old, new))

replace('src/render/miningImpactEffects.ts', '  private sync(state: GameState, now: number): void {', '  clear(): void { this.impacts = []; this.shakeUntil = 0; }\n\n  private sync(state: GameState, now: number): void {')
replace('src/render/canvasRenderer.ts', '    this.notices.clear();', '    this.notices.clear(); this.impacts.clear();')
replace('src/render/rewardEffects.ts', 'const t = Math.floor(age / 65);', 'const t = settings.motion ? Math.floor(age / 65) : 4;')

# Compare the pixels at the actual mining site, not different text labels in the notices.
replace('tests/e2e/reward-presentation.spec.ts', "const shots: Array<{ name: string; image: string }> = [];", "const shots: Array<{ name: string; image: string; site: string }> = [];\n    const sitePixels = () => Array.from(canvas.getContext('2d')!.getImageData(Math.round(node.x) - 30, Math.round(node.y) - 28, 60, 50).data).join(',');")
replace('tests/e2e/reward-presentation.spec.ts', "shots.push({ name: kind, image: canvas.toDataURL() });", "shots.push({ name: kind, image: canvas.toDataURL(), site: sitePixels() });")
replace('tests/e2e/reward-presentation.spec.ts', "const quietImage = canvas.toDataURL();", "const quietImage = canvas.toDataURL();\n    const stillSite = sitePixels(); renderer.render(state, 21260);\n    const reducedStatic = stillSite === sitePixels();")
replace('tests/e2e/reward-presentation.spec.ts', "firstImage, quietImage, shots };", "firstImage, quietImage, shots, reducedStatic };")
replace('tests/e2e/reward-presentation.spec.ts', "expect(new Set(result.shots.map(shot => shot.image)).size).toBe(4);", "expect(new Set(result.shots.map(shot => shot.site)).size).toBe(4);\n  expect(result.reducedStatic).toBe(true);")
Path(__file__).unlink()
