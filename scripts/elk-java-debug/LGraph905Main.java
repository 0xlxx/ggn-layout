import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.*;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.ElkEdge;
import org.eclipse.elk.graph.ElkLabel;
import org.eclipse.elk.graph.ElkPort;

public class LGraph905Main {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        root.setProperty(CoreOptions.RANDOM_SEED, 1);
        root.setProperty(CoreOptions.HIERARCHY_HANDLING, org.eclipse.elk.core.options.HierarchyHandling.INCLUDE_CHILDREN);
        setHierarchyRec(root);

        Class<?> impCls = Class.forName("org.eclipse.elk.alg.layered.graph.transform.ElkGraphImporter");
        Constructor<?> ctor = impCls.getDeclaredConstructor();
        ctor.setAccessible(true);
        Object importer = ctor.newInstance();
        Method importGraph = impCls.getDeclaredMethod("importGraph", ElkNode.class);
        importGraph.setAccessible(true);
        Object lg = importGraph.invoke(importer, root);
        // 直接 doLayout/doCompoundLayout 需先设 RANDOM (GraphConfigurator.prepareGraphForLayout 会做, 但此处直接反射)
        java.lang.reflect.Field randomProp = Class.forName("org.eclipse.elk.alg.layered.options.InternalProperties").getField("RANDOM");
        lg.getClass().getMethod("setProperty", org.eclipse.elk.graph.properties.IProperty.class, Object.class)
            .invoke(lg, randomProp.get(null), new java.util.Random(1));
        Class<?> elkCls = Class.forName("org.eclipse.elk.alg.layered.ElkLayered");
        Object elk = elkCls.getDeclaredConstructor().newInstance();
        Method layout = elkCls.getMethod("doCompoundLayout", Class.forName("org.eclipse.elk.alg.layered.graph.LGraph"), org.eclipse.elk.core.util.IElkProgressMonitor.class);
        layout.invoke(elk, lg, new BasicProgressMonitor());
        dumpGraph(lg, 0);
        System.out.println("--- ELK output ---");
        dump(root, 0, 0);
    }

    static void setHierarchyRec(ElkNode n) {
        n.setProperty(CoreOptions.HIERARCHY_HANDLING, org.eclipse.elk.core.options.HierarchyHandling.INCLUDE_CHILDREN);
        for (ElkNode c : n.getChildren()) setHierarchyRec(c);
    }

    static void dumpGraph(Object lg, int depth) throws Exception {
        Method getLayerless = lg.getClass().getMethod("getLayerlessNodes");
        Method getLayers = lg.getClass().getMethod("getLayers");
        Method getSize = lg.getClass().getMethod("getSize");
        Method getPadding = lg.getClass().getMethod("getPadding");
        Method getOffset = lg.getClass().getMethod("getOffset");
        Object size = getSize.invoke(lg), pad = getPadding.invoke(lg), off = getOffset.invoke(lg);
        String ind = "  ".repeat(depth);
        System.out.println(ind + "GRAPH size=(" + vx(size) + "," + vy(size) + ") pad=(" + fx(pad, "left") + "," + fx(pad, "top") + "," + fx(pad, "right") + "," + fx(pad, "bottom") + ") offset=(" + vx(off) + "," + vy(off) + ")");
        java.util.List<Object> nodes = new java.util.ArrayList<>();
        nodes.addAll((java.util.List<?>) getLayerless.invoke(lg));
        for (Object l : (java.util.List<?>) getLayers.invoke(lg)) {
            nodes.addAll((java.util.List<?>) l.getClass().getMethod("getNodes").invoke(l));
        }
        for (Object n : nodes) {
            Method getDes = n.getClass().getMethod("getDesignation");
            Method getPos = n.getClass().getMethod("getPosition");
            Method getNSize = n.getClass().getMethod("getSize");
            Method getType = n.getClass().getMethod("getType");
            Object pos = getPos.invoke(n), nsize = getNSize.invoke(n);
            System.out.println(ind + "  NODE " + getDes.invoke(n) + " type=" + getType.invoke(n) + " pos=(" + vx(pos) + "," + vy(pos) + ") size=(" + vx(nsize) + "," + vy(nsize) + ")");
            Method getNested = n.getClass().getMethod("getNestedGraph");
            Object nested = getNested.invoke(n);
            if (nested != null) dumpGraph(nested, depth + 1);
        }
    }

    static void dump(ElkNode n, double px, double py) {
        double ax = px + n.getX(), ay = py + n.getY();
        System.out.println("node " + n.getIdentifier() + " pos=(" + n.getX() + "," + n.getY() + ") abs=(" + ax + "," + ay + ") size=(" + n.getWidth() + "x" + n.getHeight() + ")");
        for (ElkPort p : n.getPorts()) {
            System.out.println("  port " + p.getIdentifier() + " pos=(" + p.getX() + "," + p.getY() + ")");
        }
        for (ElkEdge e : n.getContainedEdges()) {
            for (ElkLabel l : e.getLabels()) {
                System.out.println("  edgelabel " + l.getText() + " pos=(" + l.getX() + "," + l.getY() + ")");
            }
        }
        for (ElkNode c : n.getChildren()) dump(c, ax, ay);
    }

    static double vx(Object v) throws Exception { return (double) v.getClass().getField("x").get(v); }
    static double vy(Object v) throws Exception { return (double) v.getClass().getField("y").get(v); }
    static double fx(Object v, String m) throws Exception { return (double) v.getClass().getField(m).get(v); }
}
