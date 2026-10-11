/**
 * LGraphDumpMain — 布局后 dump ELK LGraph 内部结构 (节点/嵌套图/尺寸/坐标).
 * 解决"拿不到 jar 中间输出"痛点: 反射调用 package-private ElkGraphImporter + 公开 ElkLayered.doLayout,
 * 逐图打印 size/padding/offset + 节点 (含 EXTERNAL_PORT dummy) 位置/尺寸.
 *
 * 用法: java -cp "out:lib/*" LGraphDumpMain <input.json> [--compound|--flat] [--pre]
 *   --compound: 用 doCompoundLayout (CGP 建嵌套图); 默认 doLayout (扁平).
 *   --pre: 只 import 不布局 (看布局前状态).
 * 注: 与 EdgeMain (RecursiveGraphLayoutEngine, SEPARATE 递归) 行为可能不同 — engine 对 SEPARATE
 *     逐子节点单独布局; 此工具直连 ElkLayered. 需要 engine 语义时改用 EdgeMain + DebugMain 快照.
 */
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.*;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

public class LGraphDumpMain {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        boolean compound = false, pre = false;
        String input = null;
        for (String a : args) {
            if (a.equals("--compound")) compound = true;
            else if (a.equals("--pre")) pre = true;
            else input = a;
        }
        String json = new String(Files.readAllBytes(new java.io.File(input).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");

        Class<?> impCls = Class.forName("org.eclipse.elk.alg.layered.graph.transform.ElkGraphImporter");
        Constructor<?> ctor = impCls.getDeclaredConstructor();
        ctor.setAccessible(true);
        Object importer = ctor.newInstance();
        Method importGraph = impCls.getDeclaredMethod("importGraph", ElkNode.class);
        importGraph.setAccessible(true);
        Object lg = importGraph.invoke(importer, root);
        // 强制 INCLUDE_CHILDREN (905-new.json 的 layoutOptions 可能未传播到 LGraph)
        try {
            Class<?> core = Class.forName("org.eclipse.elk.core.options.CoreOptions");
            java.lang.reflect.Field hh = core.getField("HIERARCHY_HANDLING");
            Class<?> iprop = Class.forName("org.eclipse.elk.graph.properties.IProperty");
            java.lang.reflect.Method setProp = lg.getClass().getMethod("setProperty", iprop, Object.class);
            setProp.invoke(lg, hh.get(null), org.eclipse.elk.core.options.HierarchyHandling.INCLUDE_CHILDREN);
        } catch (Exception e) { System.err.println("setHierarchyHandling failed: " + e); }
        if (!pre) {
            Class<?> elkCls = Class.forName("org.eclipse.elk.alg.layered.ElkLayered");
            Object elk = elkCls.getDeclaredConstructor().newInstance();
            String m = compound ? "doCompoundLayout" : "doLayout";
            Method layout = elkCls.getMethod(m, Class.forName("org.eclipse.elk.alg.layered.graph.LGraph"), org.eclipse.elk.core.util.IElkProgressMonitor.class);
            layout.invoke(elk, lg, new BasicProgressMonitor());
        }
        dumpGraph(lg, 0);
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

    static double vx(Object v) throws Exception { return (double) v.getClass().getField("x").get(v); }
    static double vy(Object v) throws Exception { return (double) v.getClass().getField("y").get(v); }
    static double fx(Object v, String m) throws Exception { return (double) v.getClass().getField(m).get(v); }
}
