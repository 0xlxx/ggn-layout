import java.util.List;
import java.util.ArrayList;
import org.eclipse.elk.alg.layered.p5edges.splines.NubSpline;
import org.eclipse.elk.core.math.KVector;
import org.eclipse.elk.core.math.KVectorChain;

/** NubSpline oracle probe: 任意 clamped/unclamped 输入 → getBezierCP(false,false) 输出. */
public class NubSplineProbe {
  public static void main(String[] args) {
    int i = 0;
    while (i < args.length) {
      boolean clamped = Integer.parseInt(args[i++]) == 1;
      int dim = Integer.parseInt(args[i++]);
      int n = Integer.parseInt(args[i++]);
      List<KVector> cps = new ArrayList<>();
      for (int j = 0; j < n; j++) {
        double x = Double.parseDouble(args[i++]);
        double y = Double.parseDouble(args[i++]);
        cps.add(new KVector(x, y));
      }
      NubSpline s = new NubSpline(clamped, dim, cps);
      StringBuilder sb = new StringBuilder();
      sb.append("clamped=").append(clamped).append(" dim=").append(dim).append(" n=").append(n).append(" | ");
      KVectorChain bezier = s.getBezierCP(false, false);
      sb.append("bezier(").append(bezier.size()).append(")");
      for (KVector p : bezier) sb.append(" [").append(p.x).append(", ").append(p.y).append("]");
      System.out.println(sb);
    }
  }
}
