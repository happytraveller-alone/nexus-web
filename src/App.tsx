import { useCallback, useEffect, useRef, useState } from 'react';
import { AppStateProvider, useAppState } from './hooks/useAppState';
import { DropZone } from './components/DropZone';
import { LoadingOverlay } from './components/LoadingOverlay';
import { GraphCanvas, GraphCanvasHandle } from './components/GraphCanvas';
import { getActiveProviderConfig } from './core/llm/settings-service';

// 尝试加载打包进来的缓存，文件不存在时为 null
let bundledCache: { graph: unknown; fileContents: unknown; projectName?: string } | null = null;
try {
  bundledCache = (await import('./GraphCache.json')).default as any;
} catch {
  // GraphCache.json 不存在，走正常上传流程
}

const AppContent = () => {
  const {
    viewMode,
    setViewMode,
    setGraph,
    setFileContents,
    setProgress,
    setProjectName,
    progress,
    runPipeline,
    initializeAgent,
    startEmbeddings,
  } = useAppState();

  const graphCanvasRef = useRef<GraphCanvasHandle>(null);
  
  // 新增：从父页面同步主题
  const [background, setBackground] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'THEME_CHANGE') return;
      setBackground(event.data.theme === 'light' ? 'light' : 'dark');
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // 启动时检测到缓存则直接加载，跳过上传和 pipeline
  useEffect(() => {
    if (!bundledCache) return;
    const { graph, fileContents, projectName } = bundledCache as any;
    setGraph(graph);
    setFileContents(fileContents);
    setViewMode('exploring');
    if (projectName) setProjectName(projectName);
    if (getActiveProviderConfig()) initializeAgent(projectName ?? '');
    startEmbeddings().catch(console.warn);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelect = useCallback(async (file: File) => {
    const projectName = file.name.replace('.zip', '');
    setProjectName(projectName);
    setProgress({ phase: 'extracting', percent: 0, message: 'Starting...', detail: 'Preparing to extract files' });
    setViewMode('loading');

    try {
      const result = await runPipeline(file, (progress) => {
        setProgress(progress);
      });

      console.log("============================")
      console.log(result)
      setGraph(result.graph);
      setFileContents(result.fileContents);
      setViewMode('exploring');

      if (getActiveProviderConfig()) {
        initializeAgent(projectName);
      }

      startEmbeddings().catch((err) => {
        if (err?.name === 'WebGPUNotAvailableError' || err?.message?.includes('WebGPU')) {
          startEmbeddings('wasm').catch(console.warn);
        } else {
          console.warn('Embeddings auto-start failed:', err);
        }
      });
    } catch (error) {
      console.error('Pipeline error:', error);
      setProgress({
        phase: 'error',
        percent: 0,
        message: 'Error processing file',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
      setTimeout(() => {
        setViewMode('onboarding');
        setProgress(null);
      }, 3000);
    }
  }, [setViewMode, setGraph, setFileContents, setProgress, setProjectName, runPipeline, startEmbeddings, initializeAgent]);

  if (viewMode === 'onboarding') {
    return <DropZone onFileSelect={handleFileSelect} />;
  }

  if (viewMode === 'loading' && progress) {
    return <LoadingOverlay progress={progress} />;
  }

  return (
    <div className="flex flex-col h-screen bg-void overflow-hidden">
      <main className="flex-1 flex min-h-0">
        <div className="flex-1 relative min-w-0">
          <GraphCanvas ref={graphCanvasRef} background={background} />
        </div>
      </main>
    </div>
  );
};

function App() {
  return (
    <AppStateProvider>
      <AppContent />
    </AppStateProvider>
  );
}

export default App;