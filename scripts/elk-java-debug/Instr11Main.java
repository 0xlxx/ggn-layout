import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.*;
import java.util.*;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.IElkProgressMonitor;
import org.eclipse.elk.core.util.LoggedGraph;
import org.eclipse.elk.graph.ElkNode;

/** 打印式 monitor: 只 System.out 反射 dump, 不写文件 — 验证是否扰动 + 拿 oracle 路径状态. */
public class Instr11Main {
    static class M implements IElkProgressMonitor {
        boolean running = false;
        @Override public boolean begin(String n, float w) { running = true; return true; }
        @Override public void worked(float w) {}
        @Override public void done() { running = false; }
        @Override public boolean isRunning() { return running; }
        @Override public String getTaskName() { return "m"; }
        @Override public IElkProgressMonitor subTask(float w) { return this; }
        @Override public List<IElkProgressMonitor> getSubMonitors() { return Collections.emptyList(); }
        @Override public IElkProgressMonitor getParentMonitor() { return null; }
        @Override public boolean isLoggingEnabled() { return true; }
        @Override public boolean isLogPersistenceEnabled() { return false; }
        @Override public void log(Object message) {}
        @Override public List<String> getLogs() { return Collections.emptyList(); }
        @Override public void logGraph(ElkNode graph, String tag) {}
        @Override public void logGraph(Object graph, String tag, LoggedGraph.Type t) {
            if (graph == null) return;
            try {
                String cls = graph.getClass().getName();
                if (cls.contains("LGraph") && (tag.contains("Reverser") || tag.contains("SelfLoopPre") || tag.contains("SelfLoopRouter") || tag.contains("PortListSorter") || tag.contains("SelfLoopPortRestorer"))) {
                    dumpLGraph(graph, tag);
                }
            } catch (Exception e) {}
        }
        @Override public List<LoggedGraph> getLoggedGraphs() { return Collections.emptyList(); }
        @Override public java.nio.file.Path getDebugFolder() { return null; }
        @Override public boolean isExecutionTimeMeasured() { return false; }
        @Override public double getExecutionTime() { return 0; }
        @Override public boolean isCanceled() { return false; }
    }
    static void dumpLGraph(Object lg, String tag) throws Exception {
        List<Object> nodes = new ArrayList<>();
        Method getLayerless = lg.getClass().getMethod("getLayerlessNodes");
        Method getLayers = lg.getClass().getMethod("getLayers");
        nodes.addAll((List<?>) getLayerless.invoke(lg));
        for (Object l : (List<?>) getLayers.invoke(lg)) nodes.addAll((List<?>) l.getClass().getMethod("getNodes").invoke(l));
        for (Object n : nodes) {
            String des = (String) n.getClass().getMethod("getDesignation").invoke(n);
            if (!des.contains("NN1")) continue;
            Method getPorts = n.getClass().getMethod("getPorts");
            StringBuilder sb = new StringBuilder("### " + tag + " node=" + des + " ports=[");
            for (Object p : (List<?>) getPorts.invoke(n)) {
                Field idF = p.getClass().getField("id");
                Method getSide = p.getClass().getMethod("getSide");
                Method getNet = p.getClass().getMethod("getNetFlow");
                Method getOut = p.getClass().getMethod("getOutgoingEdges");
                Method getIn = p.getClass().getMethod("getIncomingEdges");
                sb.append("#").append(idF.get(p)).append(":").append(getSide.invoke(p)).append(":nf").append(getNet.invoke(p));
                for (Object e : (List<?>) getOut.invoke(p)) {
                    Object tp = e.getClass().getMethod("getTarget").invoke(e);
                    sb.append("->#").append(tp.getClass().getField("id").get(tp));
                }
                for (Object e : (List<?>) getIn.invoke(p)) {
                    Object sp = e.getClass().getMethod("getSource").invoke(e);
                    sb.append("<-").append("#").append(sp.getClass().getField("id").get(sp));
                }
                sb.append(" ");
            }
            sb.append("]");
            System.out.println(sb);
            return;
        }
    }
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        new RecursiveGraphLayoutEngine().layout(root, new M());
        dumpCoords(root, "");
    }
    static void dumpCoords(ElkNode n, String indent) {
        System.out.println(indent + n.getIdentifier() + " x=" + n.getX() + " y=" + n.getY());
        for (ElkNode c : n.getChildren()) dumpCoords(c, indent + "  ");
    }
}
