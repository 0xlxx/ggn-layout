import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.*;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

public class Instr6Main {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        new RecursiveGraphLayoutEngine().layout(root, new BasicProgressMonitor());
        // reflect import + dump LGraph margins
        Class<?> impCls = Class.forName("org.eclipse.elk.alg.layered.graph.transform.ElkGraphImporter");
        Constructor<?> ctor = impCls.getDeclaredConstructor(); ctor.setAccessible(true);
        Object importer = ctor.newInstance();
        Method importGraph = impCls.getDeclaredMethod("importGraph", ElkNode.class); importGraph.setAccessible(true);
        Object lg = importGraph.invoke(importer, root);
        dumpGraph(lg, 0);
    }
    static double vx(Object v) throws Exception { return (double) v.getClass().getField("x").get(v); }
    static double vy(Object v) throws Exception { return (double) v.getClass().getField("y").get(v); }
    static void dumpGraph(Object lg, int depth) throws Exception {
        Method getLayerless = lg.getClass().getMethod("getLayerlessNodes");
        Method getLayers = lg.getClass().getMethod("getLayers");
        Method getSize = lg.getClass().getMethod("getSize");
        Method getOffset = lg.getClass().getMethod("getOffset");
        Object size = getSize.invoke(lg), off = getOffset.invoke(lg);
        String ind = "  ".repeat(depth);
        System.out.println(ind + "GRAPH size=(" + vx(size) + "," + vy(size) + ") offset=(" + vx(off) + "," + vy(off) + ")");
        java.util.List<Object> nodes = new java.util.ArrayList<>();
        nodes.addAll((java.util.List<?>) getLayerless.invoke(lg));
        for (Object l : (java.util.List<?>) getLayers.invoke(lg)) nodes.addAll((java.util.List<?>) l.getClass().getMethod("getNodes").invoke(l));
        for (Object n : nodes) {
            Method getMargin = n.getClass().getMethod("getMargin");
            Method getPos = n.getClass().getMethod("getPosition");
            Method getNSize = n.getClass().getMethod("getSize");
            Object m = getMargin.invoke(n);
            System.out.println(ind + "  NODE " + n.getClass().getMethod("getDesignation").invoke(n)
                + " pos=(" + vx(getPos.invoke(n)) + "," + vy(getPos.invoke(n)) + ") size=(" + vx(getNSize.invoke(n)) + "," + vy(getNSize.invoke(n)) + ")"
                + " margin.t=" + m.getClass().getField("top").get(m) + " b=" + m.getClass().getField("bottom").get(m)
                + " l=" + m.getClass().getField("left").get(m) + " r=" + m.getClass().getField("right").get(m));
            Method getNested = n.getClass().getMethod("getNestedGraph");
            Object nested = getNested.invoke(n);
            if (nested != null) dumpGraph(nested, depth + 1);
        }
    }
}
