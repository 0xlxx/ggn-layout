import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.core.util.IElkProgressMonitor;
import org.eclipse.elk.core.util.LoggedGraph;
import org.eclipse.elk.graph.ElkNode;

/** 静默收集 monitor: isLoggingEnabled=true 但 logGraph 只记 tag, 不做任何事 (验证 DebugMain 扰动源). */
public class Instr9Main {
    static class SilentMonitor implements IElkProgressMonitor {
        boolean running = false;
        List<String> tags = new ArrayList<>();
        @Override public boolean begin(String name, float work) { running = true; return true; }
        @Override public void worked(float work) {}
        @Override public void done() { running = false; }
        @Override public boolean isRunning() { return running; }
        @Override public String getTaskName() { return "silent"; }
        @Override public IElkProgressMonitor subTask(float work) { return this; }
        @Override public List<IElkProgressMonitor> getSubMonitors() { return Collections.emptyList(); }
        @Override public IElkProgressMonitor getParentMonitor() { return null; }
        @Override public boolean isLoggingEnabled() { return true; }
        @Override public boolean isLogPersistenceEnabled() { return false; }
        @Override public void log(Object message) {}
        @Override public List<String> getLogs() { return Collections.emptyList(); }
        @Override public void logGraph(ElkNode graph, String tag) { tags.add(tag); graph.toString(); }
        @Override public void logGraph(Object graph, String tag, LoggedGraph.Type graphType) { tags.add(tag); if (graph != null) graph.toString(); }
        @Override public List<LoggedGraph> getLoggedGraphs() { return Collections.emptyList(); }
        @Override public java.nio.file.Path getDebugFolder() { return null; }
        @Override public boolean isExecutionTimeMeasured() { return false; }
        @Override public double getExecutionTime() { return 0; }
        @Override public boolean isCanceled() { return false; }
    }
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        SilentMonitor m = new SilentMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, m);
        m.done();
        dumpCoords(root, "");
    }
    static void dumpCoords(ElkNode n, String indent) {
        System.out.println(indent + n.getIdentifier() + " x=" + n.getX() + " y=" + n.getY());
        for (ElkNode c : n.getChildren()) dumpCoords(c, indent + "  ");
    }
}
