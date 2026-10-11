import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.*;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

public class Instr8Main {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        new RecursiveGraphLayoutEngine().layout(root, new BasicProgressMonitor());
        // Re-import and run only up to SelfLoopPreprocessor via doLayout's GraphConfigurator? Instead, import & inspect ports
        Class<?> impCls = Class.forName("org.eclipse.elk.alg.layered.graph.transform.ElkGraphImporter");
        Constructor<?> ctor = impCls.getDeclaredConstructor(); ctor.setAccessible(true);
        Object importer = ctor.newInstance();
        Method importGraph = impCls.getDeclaredMethod("importGraph", ElkNode.class); importGraph.setAccessible(true);
        Object lg = importGraph.invoke(importer, root);
        dumpNodes(lg, 0);
    }
    static double vx(Object v) throws Exception { return (double) v.getClass().getField("x").get(v); }
    static double vy(Object v) throws Exception { return (double) v.getClass().getField("y").get(v); }
    static void dumpNodes(Object lg, int depth) throws Exception {
        Method getLayerless = lg.getClass().getMethod("getLayerlessNodes");
        Method getLayers = lg.getClass().getMethod("getLayers");
        String ind = "  ".repeat(depth);
        for (Object n : (java.util.List<?>) getLayerless.invoke(lg)) {
            Method getDes = n.getClass().getMethod("getDesignation");
            Method getPorts = n.getClass().getMethod("getPorts");
            StringBuilder sb = new StringBuilder(ind + "NODE " + getDes.invoke(n));
            for (Object p : (java.util.List<?>) getPorts.invoke(n)) {
                Method getSide = p.getClass().getMethod("getSide");
                java.lang.reflect.Field idField = p.getClass().getField("id");
                sb.append(" port[#").append(idField.get(p)).append("]@").append(getSide.invoke(p));
                Method getOut = p.getClass().getMethod("getOutgoingEdges");
                for (Object e : (java.util.List<?>) getOut.invoke(p)) {
                    Method getTarget = e.getClass().getMethod("getTarget");
                    Object tp = getTarget.invoke(e);
                    sb.append(" ->[#").append(tp.getClass().getField("id").get(tp)).append("]");
                }
            }
            System.out.println(sb);
            Method getNested = n.getClass().getMethod("getNestedGraph");
            Object nested = getNested.invoke(n);
            if (nested != null) dumpNodes(nested, depth + 1);
        }
    }
}
