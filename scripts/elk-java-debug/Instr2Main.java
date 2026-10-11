import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.*;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

public class Instr2Main {
    static Object vx(Object v) throws Exception { return v.getClass().getField("x").get(v); }
    static Object vy(Object v) throws Exception { return v.getClass().getField("y").get(v); }
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        ElkNode nparent = root.getChildren().get(0);
        // Import Nparent with SEPARATE (default)
        Class<?> impCls = Class.forName("org.eclipse.elk.alg.layered.graph.transform.ElkGraphImporter");
        Constructor<?> ctor = impCls.getDeclaredConstructor(); ctor.setAccessible(true);
        Object importer = ctor.newInstance();
        Method importGraph = impCls.getDeclaredMethod("importGraph", ElkNode.class); importGraph.setAccessible(true);
        Object lg = importGraph.invoke(importer, nparent);
        dumpGraph(lg, 0);
        System.out.println("=== after doLayout ===");
        Class<?> elkCls = Class.forName("org.eclipse.elk.alg.layered.ElkLayered");
        Object elk = elkCls.getDeclaredConstructor().newInstance();
        Method layout = elkCls.getMethod("doLayout", Class.forName("org.eclipse.elk.alg.layered.graph.LGraph"), org.eclipse.elk.core.util.IElkProgressMonitor.class);
        layout.invoke(elk, lg, new BasicProgressMonitor());
        dumpGraph(lg, 0);
        System.out.println("Nparent ElkNode now: " + nparent.getWidth() + "x" + nparent.getHeight());
        // applyLayout via LayeredLayoutProvider's transferrer
        Class<?> tt = Class.forName("org.eclipse.elk.alg.layered.graph.transform.ElkGraphTransformer");
        Object tr = tt.getDeclaredConstructor().newInstance();
        Method apply = tt.getMethod("applyLayout", Class.forName("org.eclipse.elk.alg.layered.graph.LGraph"));
        apply.invoke(tr, lg);
        System.out.println("Nparent ElkNode after applyLayout: " + nparent.getWidth() + "x" + nparent.getHeight());
    }
    static void dumpGraph(Object lg, int depth) throws Exception {
        Method getLayerless = lg.getClass().getMethod("getLayerlessNodes");
        Method getSize = lg.getClass().getMethod("getSize");
        Method getPadding = lg.getClass().getMethod("getPadding");
        Object size = getSize.invoke(lg), pad = getPadding.invoke(lg);
        String ind = "  ".repeat(depth);
        System.out.println(ind + "GRAPH size=(" + vx(size) + "," + vy(size) + ") pad.left=" + pad.getClass().getField("left").get(pad) + " top=" + pad.getClass().getField("top").get(pad));
        for (Object n : (java.util.List<?>) getLayerless.invoke(lg)) {
            Method getDes = n.getClass().getMethod("getDesignation");
            Method getPos = n.getClass().getMethod("getPosition");
            Method getNSize = n.getClass().getMethod("getSize");
            System.out.println(ind + "  NODE " + getDes.invoke(n) + " pos=(" + vx(getPos.invoke(n)) + "," + vy(getPos.invoke(n)) + ") size=(" + vx(getNSize.invoke(n)) + "," + vy(getNSize.invoke(n)) + ")");
        }
    }
}
